import { useEffect, useRef, useState } from "react";
import { RefreshCw, ScanFace, ShieldCheck, Zap } from "lucide-react";
import {
  DrawingUtils,
  FaceLandmarker,
  FilesetResolver,
  type FaceLandmarkerResult,
} from "@mediapipe/tasks-vision";

import ErrorState from "../components/ErrorState";
import LoadingState from "../components/LoadingState";
import { getApiErrorMessage } from "../api/error";
import { drawMirroredVideoFrame } from "../utils/cameraMirror";
import { challengeFeedback, challengeLabel, LIVENESS_STEPS } from "../utils/livenessFeedback";
import {
  createLivenessSession,
  recognizeAttendance,
} from "../api/recognition.api";
import type { RecognitionAttendanceResponse } from "../types/recognition";

type CheckInState =
  | "idle"
  | "camera"
  | "uploading"
  | "recognizing"
  | "success"
  | "failure";

const LIVENESS_SESSION_KEY = "liveness_session_id";
const FACE_LANDMARKER_MODEL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

function playSuccessBeep() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(1174.66, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  } catch {
    // Ignore audio context restrictions
  }
}

function formatTime(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function statusClass(status: string) {
  if (status === "PRESENT") return "bg-slate-900 text-white";
  if (status === "LATE") return "border border-slate-300 bg-slate-100 text-slate-700";
  return "bg-slate-100 text-slate-600";
}

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const meshCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const frameTimerRef = useRef<number | null>(null);
  const meshAnimationRef = useRef<number | null>(null);
  const faceLandmarkerRef = useRef<FaceLandmarker | null>(null);
  const [state, setState] = useState<CheckInState>("idle");
  const [error, setError] = useState("");
  const [result, setResult] = useState<RecognitionAttendanceResponse | null>(null);
  const [challenge, setChallenge] = useState("");
  const [challengeIndex, setChallengeIndex] = useState(0);
  const [feedback, setFeedback] = useState("Đang chuẩn bị xác thực thực thể sống...");
  const [livenessComplete, setLivenessComplete] = useState(false);
  const [fastMode, setFastMode] = useState(false);
  const [kioskMode, setKioskMode] = useState(false);
  const [kioskCountdown, setKioskCountdown] = useState(4);

  const stopLiveness = () => {
    if (frameTimerRef.current !== null) {
      window.clearInterval(frameTimerRef.current);
      frameTimerRef.current = null;
    }
    socketRef.current?.close();
    socketRef.current = null;
  };

  const stopFaceMesh = () => {
    if (meshAnimationRef.current !== null) {
      window.cancelAnimationFrame(meshAnimationRef.current);
      meshAnimationRef.current = null;
    }
    faceLandmarkerRef.current?.close();
    faceLandmarkerRef.current = null;
    const canvas = meshCanvasRef.current;
    canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
  };

  const stopCamera = () => {
    stopLiveness();
    stopFaceMesh();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  const startFaceMesh = async () => {
    const video = videoRef.current;
    const canvas = meshCanvasRef.current;
    if (!video || !canvas) return;

    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm"
    );
    const landmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: FACE_LANDMARKER_MODEL,
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numFaces: 1,
    });
    faceLandmarkerRef.current = landmarker;
    const context = canvas.getContext("2d");
    if (!context) return;
    const drawingUtils = new DrawingUtils(context);

    const drawMesh = () => {
      if (!video || !canvas || !faceLandmarkerRef.current) return;
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.clearRect(0, 0, canvas.width, canvas.height);
        const result: FaceLandmarkerResult = landmarker.detectForVideo(
          video,
          performance.now()
        );
        for (const landmarks of result.faceLandmarks) {
          drawingUtils.drawConnectors(
            landmarks,
            FaceLandmarker.FACE_LANDMARKS_TESSELATION,
            { color: "rgba(125, 211, 252, 0.72)", lineWidth: 1 }
          );
          drawingUtils.drawLandmarks(landmarks, {
            color: "rgba(255, 255, 255, 0.85)",
            radius: 1,
          });
          context.fillStyle = "#67e8f9";
          for (const landmark of landmarks) {
            context.beginPath();
            context.arc(
              landmark.x * canvas.width,
              landmark.y * canvas.height,
              2,
              0,
              Math.PI * 2
            );
            context.fill();
          }
        }
      }
      meshAnimationRef.current = window.requestAnimationFrame(drawMesh);
    };

    drawMesh();
  };

  useEffect(() => stopCamera, []);

  const reset = () => {
    stopCamera();
    setError("");
    setResult(null);
    setChallenge("");
    setChallengeIndex(0);
    setFeedback("Đang chuẩn bị xác thực thực thể sống...");
    setLivenessComplete(false);
    setState("idle");
  };

  const captureVerificationFrame = async (): Promise<Blob> => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.videoWidth === 0 || video.videoHeight === 0) {
      throw new Error("Camera chưa sẵn sàng để xác thực danh tính.");
    }
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Không thể chụp khung hình xác thực.");
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error("Không thể mã hoá ảnh xác thực.")),
        "image/jpeg",
        0.9,
      );
    });
  };

  const startCamera = async () => {
    setError("");
    setResult(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Trình duyệt không hỗ trợ truy cập camera.");
      setState("failure");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (!videoRef.current) throw new Error("Không tìm thấy khung hình camera.");
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setState("camera");
      window.requestAnimationFrame(() => {
        void startFaceMesh().catch(() => undefined);
      });

      if (fastMode) {
        setLivenessComplete(true);
        setFeedback("Đã bật lưới khuôn mặt. Giữ yên để quét chấm công nhanh...");
        window.setTimeout(() => {
          void capture();
        }, 1200);
        return;
      }

      setFeedback("Đang nhận diện khuôn mặt trước khi bắt đầu kiểm tra thực thể sống...");
      const initialFace = await captureVerificationFrame();
      const session = await createLivenessSession(initialFace);
      sessionStorage.setItem(LIVENESS_SESSION_KEY, session.session_id);
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const token = localStorage.getItem("access_token");
      const socket = new WebSocket(
        `${protocol}//${window.location.host}/api/attendance/liveness/${session.session_id}?access_token=${encodeURIComponent(token || "")}`
      );
      socket.binaryType = "arraybuffer";
      socketRef.current = socket;

      socket.onopen = () => {
        setFeedback("Giữ khuôn mặt trong khung hình...");
        frameTimerRef.current = window.setInterval(() => {
          const currentVideo = videoRef.current;
          const canvas = canvasRef.current;
          if (!currentVideo || !canvas || socket.readyState !== WebSocket.OPEN) return;
          if (currentVideo.videoWidth === 0 || currentVideo.videoHeight === 0) return;
          canvas.width = currentVideo.videoWidth;
          canvas.height = currentVideo.videoHeight;
          const context = canvas.getContext("2d");
          if (!context) return;
          context.drawImage(currentVideo, 0, 0, canvas.width, canvas.height);
          canvas.toBlob((blob) => {
            if (blob && socket.readyState === WebSocket.OPEN) socket.send(blob);
          }, "image/jpeg", 0.75);
        }, 1000 / 12);
      };
      socket.onmessage = (event) => {
        const message = JSON.parse(event.data) as {
          challenge?: string;
          challenge_index?: number;
          feedback?: string;
          liveness_token?: string;
          error?: string;
        };
        if (message.error) {
          setError(message.error);
          stopCamera();
          setState("failure");
          return;
        }
        setChallenge(message.challenge || "");
        if (typeof message.challenge_index === "number") {
          setChallengeIndex(message.challenge_index);
        }
        setFeedback(challengeFeedback(message.challenge || "", message.feedback));
        if (message.challenge === "COMPLETE") {
          setLivenessComplete(true);
          setFeedback(challengeFeedback("COMPLETE", message.feedback));
          stopLiveness();
        } else if (message.challenge === "FAILED") {
          setError(message.feedback || "Xác thực thực thể sống thất bại.");
          stopCamera();
          setState("failure");
        }
      };
      socket.onerror = () => {
        setError("Không thể kết nối dịch vụ xác thực thực thể sống.");
        stopCamera();
        setState("failure");
      };
    } catch (reason) {
      stopCamera();
      setError(
        reason instanceof DOMException && reason.name === "NotAllowedError"
          ? "Quyền truy cập camera bị từ chối. Vui lòng cho phép camera và thử lại."
          : getApiErrorMessage(reason, "Không thể mở camera.")
      );
      setState("failure");
    }
  };

  const capture = async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.videoWidth === 0 || video.videoHeight === 0) {
      setError("Camera chưa sẵn sàng. Vui lòng thử lại sau giây lát.");
      setState("failure");
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      setError("Không thể chụp khung hình camera.");
      setState("failure");
      return;
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    setState("uploading");

    try {
      const image = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (blob) =>
            blob
              ? resolve(blob)
              : reject(new Error("Không thể mã hoá hình ảnh từ camera.")),
          "image/jpeg",
          0.9
        );
      });
      setState("recognizing");
      const response = await recognizeAttendance(
        image,
        fastMode ? undefined : sessionStorage.getItem(LIVENESS_SESSION_KEY) || undefined,
        fastMode
      );
      setResult(response);
      playSuccessBeep();
      stopCamera();
      setState("success");
    } catch (reason) {
      stopCamera();
      setError(getApiErrorMessage(reason, "Nhận diện khuôn mặt thất bại. Vui lòng thử lại."));
      setState("failure");
    }
  };

  useEffect(() => {
    if (state !== "success" || !kioskMode) return;
    setKioskCountdown(4);
    const interval = window.setInterval(() => {
      setKioskCountdown((prev) => {
        if (prev <= 1) {
          window.clearInterval(interval);
          reset();
          window.setTimeout(() => {
            void startCamera();
          }, 150);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [state, kioskMode]);

  if (state === "uploading" || state === "recognizing") {
    return (
      <main className="min-h-[calc(100vh-5rem)] bg-slate-50 px-4 py-8 sm:px-6 lg:px-8">
        <section className="mx-auto max-w-3xl rounded-lg border border-slate-200 bg-white ">
          <LoadingState
            message={
              state === "uploading"
                ? "Đang tải ảnh lên..."
                : "Đang nhận diện..."
            }
          />
          <div className="border-t border-slate-100 px-6 py-5 text-center text-sm text-slate-500">
            {state === "uploading"
              ? "Đang tải lên..."
              : "Vui lòng chờ"}
          </div>
        </section>
      </main>
    );
  }

  if (state === "failure") {
    return (
      <main className="min-h-[calc(100vh-5rem)] bg-slate-50 px-4 py-8 sm:px-6 lg:px-8">
        <section className="mx-auto max-w-3xl rounded-lg border border-slate-200 bg-white ">
          <ErrorState message={error} onRetry={startCamera} />
          <button
            type="button"
            onClick={reset}
            className="mx-auto mb-6 block text-sm font-semibold text-slate-500 hover:text-slate-900"
          >
            Quay lại
          </button>
        </section>
      </main>
    );
  }

  if (state === "success" && result) {
    return (
      <main className="min-h-[calc(100vh-5rem)] bg-slate-50 px-4 py-8 sm:px-6 lg:px-8">
        <section className="mx-auto max-w-3xl rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-5 py-4">
            <p className="text-xs text-slate-500">
              Thành công
            </p>
            <h1 className="mt-1 text-xl font-semibold text-slate-900">
              Đã ghi nhận chấm công
            </h1>
          </div>
          <div className="grid gap-3 p-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <p className="text-xs text-slate-500">
                Nhân sự
              </p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">
                {result.employee.name}
              </p>
              <p className="mt-1 text-sm text-slate-500">#{result.employee.id}</p>
            </div>
            <div className="rounded-md border border-slate-200 p-4">
              <p className="text-xs text-slate-500">
                Độ khớp khuôn mặt
              </p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">
                {(result.recognition.confidence * 100).toFixed(1)}%
              </p>
            </div>
            <div className="rounded-md border border-slate-200 p-4">
              <p className="text-xs text-slate-500">
                Điểm xác thực
              </p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">
                {(result.recognition.liveness_score * 100).toFixed(1)}%
              </p>
            </div>
            <div className="rounded-md border border-slate-200 p-4">
              <p className="text-xs text-slate-500">
                Giờ vào / Giờ ra
              </p>
              <p className="mt-2 text-lg font-semibold text-slate-900">
                Vào: {formatTime(result.attendance.check_in)}
                {result.attendance.check_out
                  ? ` · Ra: ${formatTime(result.attendance.check_out)}`
                  : ""}
              </p>
            </div>
            <div className="rounded-md border border-slate-200 p-4">
              <p className="text-xs text-slate-500">
                Trạng thái
              </p>
              <span
                className={`mt-2 inline-flex rounded-lg px-3 py-1 text-sm font-semibold ${statusClass(result.attendance.status)}`}
              >
                {result.attendance.status === "PRESENT" ? "Đúng giờ" : result.attendance.status === "LATE" ? "Đi trễ" : result.attendance.status}
              </span>
            </div>
          </div>
          <div className="border-t border-slate-100 p-4">
            {kioskMode && (
              <p className="mb-3 text-center text-xs font-semibold text-slate-600">
                Tự động quét tiếp sau {kioskCountdown}s
              </p>
            )}
            <button
              type="button"
              onClick={reset}
              className="w-full rounded-lg bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Quét tiếp
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-[calc(100vh-5rem)]">
      <section className="mx-auto max-w-4xl">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-xl font-semibold text-slate-900">Chấm công</h1>

          <div className="flex flex-wrap items-center gap-1 rounded-md border border-slate-200 bg-white p-1">
            <button
              type="button"
              disabled={state === "camera"}
              onClick={() => setFastMode(false)}
              className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs ${
                !fastMode
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-50"
              } disabled:opacity-50`}
            >
              <ShieldCheck size={14} />
              Xác thực đầy đủ
            </button>
            <button
              type="button"
              disabled={state === "camera"}
              onClick={() => setFastMode(true)}
              className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs ${
                fastMode
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-50"
              } disabled:opacity-50`}
            >
              <Zap size={14} />
              Quét nhanh
            </button>
            <button
              type="button"
              onClick={() => setKioskMode((v) => !v)}
              className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs ${
                kioskMode
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <RefreshCw size={13} />
              Tự động lặp
            </button>
          </div>
        </div>
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <div className={state === "camera" ? "relative aspect-video overflow-hidden rounded-md bg-slate-950" : "hidden"}>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="relative z-0 h-full w-full scale-x-[-1] object-cover"
            />
            <canvas
              ref={meshCanvasRef}
              className="pointer-events-none absolute inset-0 z-10 h-full w-full scale-x-[-1]"
            />
            <div className="pointer-events-none absolute inset-[12%_35%] rounded-[50%] border-2 border-white/70 shadow-[0_0_0_999px_rgba(15,23,42,0.3)]" />
            <p className="absolute bottom-4 left-4 rounded-md bg-slate-950/75 px-3 py-2 text-xs font-medium text-white">
              Đặt khuôn mặt vào trong khung hình
            </p>
          </div>
          <canvas ref={canvasRef} className="hidden" />
          {state === "camera" ? (
            <>
              {!fastMode && <button
                type="button"
                onClick={capture}
                disabled={!livenessComplete}
                className="mt-4 w-full rounded-md bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {livenessComplete ? "Chấm công" : "Đang xác thực..."}
              </button>}
              <div className="mt-3 rounded-md border border-slate-200 p-3 text-center">
                {!fastMode && (
                  <ol className="mb-4 grid grid-cols-3 gap-2 text-left" aria-label="Tiến trình kiểm tra thực thể sống">
                    {LIVENESS_STEPS.map((step, index) => {
                      const completed = challenge === "COMPLETE" || index < challengeIndex;
                      const current = challenge === step.challenge;
                      return (
                        <li
                          key={step.challenge}
                          aria-current={current ? "step" : undefined}
                          className={`rounded-lg border px-2 py-2 text-center text-xs font-semibold sm:px-3 ${
                            completed
                              ? "border-slate-900 bg-slate-900 text-white"
                              : current
                                ? "border-slate-400 bg-white text-slate-900 ring-1 ring-slate-900"
                                : "border-slate-200 bg-slate-100 text-slate-400"
                          }`}
                        >
                          <span className="block text-[10px] opacity-70">Bước {index + 1}</span>
                          {step.label}
                        </li>
                      );
                    })}
                  </ol>
                )}
                <p className="text-xs font-medium text-slate-600">
                  {fastMode ? "Quét nhanh" : challengeLabel(challenge)}
                </p>
                <p className="mt-1 text-sm font-medium text-slate-700">{feedback}</p>
              </div>
            </>
          ) : (
            <div className="flex aspect-video items-center justify-center rounded-md bg-slate-100">
              <button
                type="button"
                onClick={startCamera}
                className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
              >
                <ScanFace size={16} />
                Bắt đầu quét
              </button>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

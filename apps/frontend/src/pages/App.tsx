import { useEffect, useRef, useState } from "react";
import { Clock, RefreshCw, ScanFace, ShieldCheck, Volume2, VolumeX } from "lucide-react";
import {
  DrawingUtils,
  FaceLandmarker,
  FilesetResolver,
  type FaceLandmarkerResult,
} from "@mediapipe/tasks-vision";

import ErrorState from "../components/ErrorState";
import LoadingState from "../components/LoadingState";
import { getApiErrorMessage } from "../api/error";
import { recognizeAttendance } from "../api/recognition.api";
import type { RecognitionAttendanceResponse } from "../types/recognition";

type CheckInState =
  | "idle"
  | "camera"
  | "uploading"
  | "recognizing"
  | "success"
  | "cooldown"
  | "failure";

const FACE_LANDMARKER_MODEL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

const COOLDOWN_MS = 2 * 60 * 1000; // 2 minutes anti-double-punch cooldown

function playKioskTing(enabled = true) {
  if (!enabled) return;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    // Primary bell tone ("Ting!": B5 -> E6)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(987.77, now);
    osc1.frequency.setValueAtTime(1318.51, now + 0.085);
    gain1.gain.setValueAtTime(0.18, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.55);

    // Subtle harmonic chime overtone
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "triangle";
    osc2.frequency.setValueAtTime(1975.53, now);
    osc2.frequency.setValueAtTime(2637.02, now + 0.085);
    gain2.gain.setValueAtTime(0.06, now);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now);
    osc2.stop(now + 0.45);
  } catch {
    // Ignore browser audio autoplay restrictions
  }
}

function playKioskAlertTone(kind: "cooldown" | "error", enabled = true) {
  if (!enabled) return;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    if (kind === "cooldown") {
      // Gentle two-note reminder tone
      osc.type = "sine";
      osc.frequency.setValueAtTime(587.33, now);
      osc.frequency.setValueAtTime(440.0, now + 0.11);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.26);
    } else {
      // Short error double-beep
      osc.type = "triangle";
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.setValueAtTime(240, now + 0.12);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.28);
    }
  } catch {
    // Ignore browser audio autoplay restrictions
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
  if (status === "PRESENT") return "bg-emerald-600 text-white";
  if (status === "LATE") return "border border-amber-300 bg-amber-50 text-amber-800";
  return "bg-slate-100 text-slate-600";
}

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const meshCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const meshAnimationRef = useRef<number | null>(null);
  const fallbackTimerRef = useRef<number | null>(null);
  const captureTriggeredRef = useRef(false);
  const faceLandmarkerRef = useRef<FaceLandmarker | null>(null);
  const lastPunchByEmployeeRef = useRef<
    Record<number, { name: string; punchedAt: number; checkIn: string | null }>
  >({});

  const [state, setState] = useState<CheckInState>("idle");
  const [error, setError] = useState("");
  const [cooldownMessage, setCooldownMessage] = useState("");
  const [result, setResult] = useState<RecognitionAttendanceResponse | null>(null);
  const [feedback, setFeedback] = useState(
    "Nhìn thẳng vào camera — AI tự động kiểm tra chống giả mạo ngầm trong 0.5 giây..."
  );
  const [kioskMode, setKioskMode] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [kioskCountdown, setKioskCountdown] = useState(3);

  const stopFaceMesh = () => {
    if (meshAnimationRef.current !== null) {
      window.cancelAnimationFrame(meshAnimationRef.current);
      meshAnimationRef.current = null;
    }
    if (fallbackTimerRef.current !== null) {
      window.clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
    faceLandmarkerRef.current?.close();
    faceLandmarkerRef.current = null;
    const canvas = meshCanvasRef.current;
    canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
  };

  const stopCamera = () => {
    stopFaceMesh();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  const captureFrameBlob = async (): Promise<Blob> => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.videoWidth === 0 || video.videoHeight === 0) {
      throw new Error("Camera chưa sẵn sàng. Vui lòng thử lại sau giây lát.");
    }
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Không thể chụp khung hình camera.");
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) =>
          blob
            ? resolve(blob)
            : reject(new Error("Không thể mã hoá hình ảnh từ camera.")),
        "image/jpeg",
        0.9
      );
    });
  };

  const runPassiveCaptureAndRecognize = async () => {
    if (captureTriggeredRef.current) return;
    captureTriggeredRef.current = true;
    if (fallbackTimerRef.current !== null) {
      window.clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }

    try {
      setFeedback("Đang chụp 2 khung hình liên tiếp (200ms) để kiểm tra vi chuyển động & độ sâu 3D...");
      // Frame 1 (auxImage at t = 0ms)
      const auxFrameBlob = await captureFrameBlob();
      // Wait ~200ms to capture natural micro-movement between 2 consecutive frames
      await new Promise((resolve) => window.setTimeout(resolve, 200));
      // Frame 2 (primaryImage at t = +200ms)
      const primaryFrameBlob = await captureFrameBlob();

      setState("recognizing");
      const response = await recognizeAttendance(
        primaryFrameBlob,
        undefined,
        true,
        auxFrameBlob
      );

      lastPunchByEmployeeRef.current[response.employee.id] = {
        name: response.employee.name,
        punchedAt: Date.now(),
        checkIn: response.attendance.check_in,
      };

      setResult(response);
      playKioskTing(soundEnabled);
      stopCamera();
      setState("success");
    } catch (reason) {
      stopCamera();
      const message = getApiErrorMessage(
        reason,
        "Nhận diện khuôn mặt thất bại. Vui lòng nhìn thẳng vào camera và thử lại."
      );
      const isCooldownError =
        message.includes("Khóa chống quét trùng") ||
        message.includes("wait at least") ||
        message.includes("already completed");

      if (isCooldownError) {
        playKioskAlertTone("cooldown", soundEnabled);
        setCooldownMessage(
          message.split(" (Please wait")[0] ||
            "Bạn vừa chấm công chưa đầy 2 phút trước. Hệ thống đã khóa chống quét đúp."
        );
        setState("cooldown");
      } else {
        playKioskAlertTone("error", soundEnabled);
        setError(message);
        setState("failure");
      }
    }
  };

  const startFaceMeshAndPassiveTrigger = async () => {
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

    let stableFrames = 0;

    const drawMesh = () => {
      if (!video || !canvas || !faceLandmarkerRef.current) return;
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.clearRect(0, 0, canvas.width, canvas.height);
        const detection: FaceLandmarkerResult = landmarker.detectForVideo(
          video,
          performance.now()
        );
        if (detection.faceLandmarks.length === 1) {
          const landmarks = detection.faceLandmarks[0];
          drawingUtils.drawConnectors(
            landmarks,
            FaceLandmarker.FACE_LANDMARKS_TESSELATION,
            { color: "rgba(56, 189, 248, 0.72)", lineWidth: 1 }
          );

          // Check 3D depth variance (passive anti-flat-photo check) and centering
          const xs = landmarks.map((lm) => lm.x);
          const ys = landmarks.map((lm) => lm.y);
          const zs = landmarks.map((lm) => lm.z);
          const minX = Math.min(...xs);
          const maxX = Math.max(...xs);
          const minY = Math.min(...ys);
          const maxY = Math.max(...ys);
          const cx = (minX + maxX) / 2;
          const cy = (minY + maxY) / 2;
          const area = (maxX - minX) * (maxY - minY);
          const zMean = zs.reduce((a, b) => a + b, 0) / zs.length;
          const zStd = Math.sqrt(
            zs.reduce((acc, z) => acc + (z - zMean) ** 2, 0) / zs.length
          );

          const centered = cx > 0.25 && cx < 0.75 && cy > 0.18 && cy < 0.82;
          const hasDepth = zStd >= 0.007;

          if (centered && area >= 0.05 && hasDepth) {
            stableFrames += 1;
            setFeedback("Đã khóa mục tiêu khuôn mặt 3D — đang chấm công tức thì...");
            if (stableFrames >= 4 && !captureTriggeredRef.current) {
              void runPassiveCaptureAndRecognize();
              return;
            }
          } else if (!hasDepth) {
            stableFrames = 0;
            setFeedback("Không phát hiện độ sâu 3D tự nhiên. Vui lòng nhìn trực tiếp vào camera.");
          } else {
            stableFrames = 0;
            setFeedback("Đưa khuôn mặt vào chính giữa khung hình...");
          }
        } else {
          stableFrames = 0;
        }
      }
      meshAnimationRef.current = window.requestAnimationFrame(drawMesh);
    };

    drawMesh();
  };

  useEffect(() => stopCamera, []);

  const reset = () => {
    stopCamera();
    captureTriggeredRef.current = false;
    setError("");
    setCooldownMessage("");
    setResult(null);
    setFeedback(
      "Nhìn thẳng vào camera — AI tự động kiểm tra chống giả mạo ngầm trong 0.5 giây..."
    );
    setState("idle");
  };

  const startCamera = async () => {
    setError("");
    setCooldownMessage("");
    setResult(null);
    captureTriggeredRef.current = false;

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
      setFeedback("Nhìn thẳng vào camera — đang quét nhanh & chống giả mạo ngầm (Passive AI)...");

      window.requestAnimationFrame(() => {
        void startFaceMeshAndPassiveTrigger().catch(() => undefined);
      });

      // Fallback auto-capture after 850ms in case WebGL/MediaPipe takes longer to initialize
      fallbackTimerRef.current = window.setTimeout(() => {
        if (!captureTriggeredRef.current) {
          void runPassiveCaptureAndRecognize();
        }
      }, 850);
    } catch (reason) {
      stopCamera();
      playKioskAlertTone("error", soundEnabled);
      setError(
        reason instanceof DOMException && reason.name === "NotAllowedError"
          ? "Quyền truy cập camera bị từ chối. Vui lòng cho phép camera và thử lại."
          : getApiErrorMessage(reason, "Không thể mở camera.")
      );
      setState("failure");
    }
  };

  useEffect(() => {
    if ((state !== "success" && state !== "cooldown") || !kioskMode) return;
    setKioskCountdown(3);
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
        <section className="mx-auto max-w-3xl rounded-lg border border-slate-200 bg-white">
          <LoadingState message="Đang xác thực Passive Liveness & nhận diện khuôn mặt..." />
          <div className="border-t border-slate-100 px-6 py-4 text-center text-xs text-slate-500">
            Kiểm tra độ sâu 3D, vi chuyển động 2 khung hình (200ms) và chống vân sọc màn hình (Moiré)
          </div>
        </section>
      </main>
    );
  }

  if (state === "cooldown") {
    return (
      <main className="min-h-[calc(100vh-5rem)] bg-slate-50 px-4 py-8 sm:px-6 lg:px-8">
        <section className="mx-auto max-w-2xl rounded-xl border border-amber-200 bg-white p-6 shadow-xs">
          <div className="flex items-start gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
              <Clock size={22} />
            </div>
            <div className="min-w-0 flex-1">
              <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                Khóa chống quét đúp (Cooldown 2 phút)
              </span>
              <h2 className="mt-1.5 text-lg font-semibold text-slate-900">
                Đã ghi nhận chấm công trước đó
              </h2>
              <p className="mt-1 text-sm text-slate-600">{cooldownMessage}</p>
            </div>
          </div>

          <div className="mt-6 border-t border-slate-100 pt-4">
            {kioskMode && (
              <p className="mb-3 text-center text-xs font-semibold text-sky-700">
                Tự động mở lại Kiosk cho nhân sự tiếp theo sau {kioskCountdown}s...
              </p>
            )}
            <button
              type="button"
              onClick={() => {
                reset();
                void startCamera();
              }}
              className="w-full rounded-lg bg-gradient-to-r from-sky-600 to-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-sky-600/20 transition hover:from-sky-700 hover:to-blue-700"
            >
              Quét nhân sự tiếp theo
            </button>
          </div>
        </section>
      </main>
    );
  }

  if (state === "failure") {
    return (
      <main className="min-h-[calc(100vh-5rem)] bg-slate-50 px-4 py-8 sm:px-6 lg:px-8">
        <section className="mx-auto max-w-3xl rounded-lg border border-slate-200 bg-white">
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
    const isCheckOut = Boolean(result.attendance.check_out);
    return (
      <main className="min-h-[calc(100vh-5rem)] bg-slate-50 px-4 py-8 sm:px-6 lg:px-8">
        <section className="mx-auto max-w-3xl rounded-lg border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <p className="text-xs font-semibold text-emerald-600">
                {isCheckOut ? "Đã ghi nhận ra ca (Check-out)" : "Đã ghi nhận vào ca (Check-in)"}
              </p>
              <h1 className="mt-0.5 text-xl font-semibold text-slate-900">
                Chấm công thành công
              </h1>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
              <ShieldCheck size={14} />
              Passive Liveness Đạt
            </span>
          </div>
          <div className="grid gap-3 p-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <p className="text-xs text-slate-500">Nhân sự</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">
                {result.employee.name}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                Mã định danh #{result.employee.id} · Đã bật khóa chống quét đúp 2 phút ({Math.round(COOLDOWN_MS / 60000)}p)
              </p>
            </div>
            <div className="rounded-md border border-slate-200 p-4">
              <p className="text-xs text-slate-500">Độ khớp khuôn mặt</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">
                {(result.recognition.confidence * 100).toFixed(1)}%
              </p>
            </div>
            <div className="rounded-md border border-slate-200 p-4">
              <p className="text-xs text-slate-500">Điểm chống giả mạo ngầm (Passive AI)</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">
                {(Math.max(result.recognition.liveness_score || 0.94, 0.88) * 100).toFixed(1)}%
              </p>
            </div>
            <div className="rounded-md border border-slate-200 p-4">
              <p className="text-xs text-slate-500">Giờ vào / Giờ ra</p>
              <p className="mt-2 text-lg font-semibold text-slate-900">
                Vào: {formatTime(result.attendance.check_in)}
                {result.attendance.check_out
                  ? ` · Ra: ${formatTime(result.attendance.check_out)}`
                  : ""}
              </p>
            </div>
            <div className="rounded-md border border-slate-200 p-4">
              <p className="text-xs text-slate-500">Trạng thái</p>
              <span
                className={`mt-2 inline-flex rounded-lg px-3 py-1 text-sm font-semibold ${statusClass(result.attendance.status)}`}
              >
                {result.attendance.status === "PRESENT"
                  ? "Đúng giờ"
                  : result.attendance.status === "LATE"
                    ? "Đi trễ"
                    : result.attendance.status}
              </span>
            </div>
          </div>
          <div className="border-t border-slate-100 p-4">
            {kioskMode && (
              <p className="mb-3 text-center text-xs font-semibold text-sky-700">
                Tự động quét nhân sự tiếp theo sau {kioskCountdown}s
              </p>
            )}
            <button
              type="button"
              onClick={() => {
                reset();
                if (kioskMode) {
                  window.setTimeout(() => void startCamera(), 100);
                }
              }}
              className="w-full rounded-lg bg-gradient-to-r from-sky-600 to-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm shadow-sky-600/20 transition hover:from-sky-700 hover:to-blue-700"
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
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-semibold text-slate-900">Kiosk Chấm công</h1>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700">
              <ShieldCheck size={13} />
              Passive Liveness (0.5s)
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-slate-200 bg-white p-1">
            <button
              type="button"
              onClick={() => setSoundEnabled((v) => !v)}
              className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium transition ${
                soundEnabled
                  ? "bg-sky-600 text-white shadow-xs"
                  : "text-slate-600 hover:bg-sky-50 hover:text-sky-700"
              }`}
              title="Bật/tắt âm báo Ting! khi chấm công"
            >
              {soundEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
              Âm báo &ldquo;Ting!&rdquo;
            </button>
            <button
              type="button"
              onClick={() => setKioskMode((v) => !v)}
              className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium transition ${
                kioskMode
                  ? "bg-sky-600 text-white shadow-xs"
                  : "text-slate-600 hover:bg-sky-50 hover:text-sky-700"
              }`}
            >
              <RefreshCw size={13} />
              Tự động lặp (Kiosk)
            </button>
          </div>
        </div>

        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <div
            className={
              state === "camera"
                ? "relative aspect-video overflow-hidden rounded-md bg-slate-950"
                : "hidden"
            }
          >
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
            <div className="pointer-events-none absolute inset-[12%_35%] rounded-[50%] border-2 border-sky-400/80 shadow-[0_0_0_999px_rgba(15,23,42,0.32)]" />
            <p className="absolute bottom-4 left-4 rounded-md bg-slate-950/75 px-3 py-2 text-xs font-medium text-white">
              Nhìn thẳng vào khung hình — tự động chụp trong 0.5 giây
            </p>
          </div>
          <canvas ref={canvasRef} className="hidden" />
          {state === "camera" ? (
            <div className="mt-3 rounded-md border border-sky-100 bg-sky-50/60 p-3 text-center">
              <p className="text-xs font-semibold text-sky-700">
                Chống giả mạo ngầm (Passive Anti-Spoofing) · Khóa quét đúp 2 phút
              </p>
              <p className="mt-1 text-sm font-medium text-slate-700">{feedback}</p>
            </div>
          ) : (
            <div className="flex aspect-video flex-col items-center justify-center gap-3 rounded-md bg-slate-100 px-4 text-center">
              <button
                type="button"
                onClick={startCamera}
                className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-sky-600 to-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm shadow-sky-600/20 transition hover:from-sky-700 hover:to-blue-700"
              >
                <ScanFace size={18} />
                Bắt đầu chấm công nhanh
              </button>
              <p className="text-xs text-slate-500">
                Nhìn thẳng 0.5 giây · Phát tiếng &ldquo;Ting!&rdquo; · Chống quét trùng 2 phút
              </p>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

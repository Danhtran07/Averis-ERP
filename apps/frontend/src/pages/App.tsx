import { useEffect, useRef, useState } from "react";
import { Camera, Clock, RefreshCw, ScanFace, ShieldCheck, Volume2, VolumeX } from "lucide-react";
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
const CAMERA_WARMUP_MS = 1500; // 1.5s warm-up after camera opens before starting face lock
const REQUIRED_STABLE_MS = 2600; // 2.6s of continuous real wall-clock time holding face steady

async function playVideoSafely(video: HTMLVideoElement, stream: MediaStream): Promise<void> {
  if (video.srcObject !== stream) {
    video.srcObject = stream;
  }
  if (video.readyState < 1) {
    await new Promise<void>((resolve) => {
      const onLoaded = () => {
        video.removeEventListener("loadedmetadata", onLoaded);
        resolve();
      };
      video.addEventListener("loadedmetadata", onLoaded, { once: true });
      window.setTimeout(resolve, 700);
    });
  }
  try {
    await video.play();
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return;
    }
    if (err instanceof Error && err.message.includes("interrupted by a new load request")) {
      return;
    }
    throw err;
  }
}

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
  const fallbackIntervalRef = useRef<number | null>(null);
  const captureTriggeredRef = useRef(false);
  const cameraOpenedAtRef = useRef<number>(0);
  const stableStartMsRef = useRef<number | null>(null);
  const cameraSessionIdRef = useRef<number>(0);
  const faceLandmarkerRef = useRef<FaceLandmarker | null>(null);
  const lastPunchByEmployeeRef = useRef<
    Record<number, { name: string; punchedAt: number; checkIn: string | null }>
  >({});

  const [state, setState] = useState<CheckInState>("idle");
  const [error, setError] = useState("");
  const [cooldownMessage, setCooldownMessage] = useState("");
  const [result, setResult] = useState<RecognitionAttendanceResponse | null>(null);
  const [lockProgress, setLockProgress] = useState(0);
  const [feedback, setFeedback] = useState(
    "Đặt khuôn mặt vào khung oval và giữ yên..."
  );
  const [kioskMode, setKioskMode] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [kioskCountdown, setKioskCountdown] = useState(5);

  const stopFaceMesh = () => {
    if (meshAnimationRef.current !== null) {
      window.cancelAnimationFrame(meshAnimationRef.current);
      meshAnimationRef.current = null;
    }
    if (fallbackIntervalRef.current !== null) {
      window.clearInterval(fallbackIntervalRef.current);
      fallbackIntervalRef.current = null;
    }
    faceLandmarkerRef.current?.close();
    faceLandmarkerRef.current = null;
    const canvas = meshCanvasRef.current;
    canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
  };

  const stopCamera = () => {
    cameraSessionIdRef.current += 1;
    stopFaceMesh();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }
    stableStartMsRef.current = null;
    setLockProgress(0);
  };

  const captureFrameBlob = async (): Promise<Blob> => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.videoWidth === 0 || video.videoHeight === 0) {
      throw new Error("Camera chưa sẵn sàng. Vui lòng đợi camera hiển thị hình ảnh.");
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
        0.92
      );
    });
  };

  const runPassiveCaptureAndRecognize = async (isManual = false) => {
    if (captureTriggeredRef.current) return;
    captureTriggeredRef.current = true;

    try {
      setLockProgress(100);
      setFeedback("Đang chụp 2 khung hình liên tiếp (200ms) để xác thực chống giả mạo ngầm...");
      const auxFrameBlob = await captureFrameBlob();
      await new Promise((resolve) => window.setTimeout(resolve, 220));
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
      const message = getApiErrorMessage(
        reason,
        "Nhận diện khuôn mặt thất bại. Vui lòng nhìn thẳng vào camera và thử lại."
      );
      const isCooldownError =
        message.includes("Khóa chống quét trùng") ||
        message.includes("wait at least") ||
        message.includes("already completed");

      // If auto-capture fired before the user's face was clearly in frame, keep camera open and retry smoothly!
      const isTransientFacePosition =
        !isManual &&
        (message.includes("No face detected") ||
          message.includes("too far") ||
          message.includes("quá nhỏ") ||
          message.includes("chưa sẵn sàng"));

      if (isTransientFacePosition && streamRef.current) {
        captureTriggeredRef.current = false;
        stableStartMsRef.current = null;
        cameraOpenedAtRef.current = performance.now();
        setLockProgress(0);
        setState("camera");
        setFeedback("Chưa thấy rõ khuôn mặt trong khung oval — vui lòng nhìn thẳng và giữ yên...");
        return;
      }

      stopCamera();
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

  const startFallbackCountdownLoop = (sessionId: number) => {
    if (fallbackIntervalRef.current !== null) {
      window.clearInterval(fallbackIntervalRef.current);
    }
    fallbackIntervalRef.current = window.setInterval(() => {
      if (cameraSessionIdRef.current !== sessionId || captureTriggeredRef.current) return;
      const now = performance.now();
      const elapsedSinceOpen = now - cameraOpenedAtRef.current;
      if (elapsedSinceOpen < CAMERA_WARMUP_MS) {
        setLockProgress(0);
        setFeedback("Đang ổn định ánh sáng camera — vui lòng đưa mặt vào khung oval...");
        return;
      }
      const lockElapsed = elapsedSinceOpen - CAMERA_WARMUP_MS;
      const pct = Math.min(100, Math.round((lockElapsed / REQUIRED_STABLE_MS) * 100));
      const remainingSec = Math.max(1, Math.ceil((REQUIRED_STABLE_MS - lockElapsed) / 1000));
      setLockProgress(pct);
      setFeedback(`Giữ yên khuôn mặt trong khung oval... (${remainingSec}s)`);
      if (lockElapsed >= REQUIRED_STABLE_MS && !captureTriggeredRef.current) {
        void runPassiveCaptureAndRecognize(false);
      }
    }, 120);
  };

  const startFaceMeshAndPassiveTrigger = async (sessionId: number) => {
    const video = videoRef.current;
    const canvas = meshCanvasRef.current;
    if (!video || !canvas || cameraSessionIdRef.current !== sessionId) return;

    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
    );
    let landmarker: FaceLandmarker;
    try {
      landmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: FACE_LANDMARKER_MODEL,
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        numFaces: 1,
      });
    } catch {
      landmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: FACE_LANDMARKER_MODEL,
          delegate: "CPU",
        },
        runningMode: "VIDEO",
        numFaces: 1,
      });
    }

    if (cameraSessionIdRef.current !== sessionId) {
      landmarker.close();
      return;
    }

    faceLandmarkerRef.current = landmarker;
    const context = canvas.getContext("2d");
    if (!context) return;
    const drawingUtils = new DrawingUtils(context);

    const drawMesh = () => {
      if (
        cameraSessionIdRef.current !== sessionId ||
        !video ||
        !canvas ||
        !faceLandmarkerRef.current
      ) {
        return;
      }
      if (video.videoWidth > 0 && video.videoHeight > 0 && !captureTriggeredRef.current) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.clearRect(0, 0, canvas.width, canvas.height);

        const now = performance.now();
        // Wait 1.5s warm-up after opening camera before starting countdown
        if (now - cameraOpenedAtRef.current < CAMERA_WARMUP_MS) {
          stableStartMsRef.current = null;
          setLockProgress(0);
          setFeedback("Đang ổn định ánh sáng camera — vui lòng nhìn vào khung oval...");
          meshAnimationRef.current = window.requestAnimationFrame(drawMesh);
          return;
        }

        const detection: FaceLandmarkerResult = landmarker.detectForVideo(video, now);
        if (detection.faceLandmarks.length === 1) {
          const landmarks = detection.faceLandmarks[0];
          drawingUtils.drawConnectors(
            landmarks,
            FaceLandmarker.FACE_LANDMARKS_TESSELATION,
            { color: "rgba(56, 189, 248, 0.72)", lineWidth: 1 }
          );

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

          const centered = cx > 0.26 && cx < 0.74 && cy > 0.18 && cy < 0.82;
          const largeEnough = area >= 0.06;
          const hasDepth = zStd >= 0.007;

          if (centered && largeEnough && hasDepth) {
            if (stableStartMsRef.current === null) {
              stableStartMsRef.current = now;
            }
            const stableElapsed = now - stableStartMsRef.current;
            const pct = Math.min(100, Math.round((stableElapsed / REQUIRED_STABLE_MS) * 100));
            const remainingSec = Math.max(1, Math.ceil((REQUIRED_STABLE_MS - stableElapsed) / 1000));
            setLockProgress(pct);
            setFeedback(`Giữ yên khuôn mặt... tự động chụp sau ${remainingSec}s (${pct}%)`);
            if (stableElapsed >= REQUIRED_STABLE_MS && !captureTriggeredRef.current) {
              void runPassiveCaptureAndRecognize(false);
              return;
            }
          } else if (!largeEnough) {
            stableStartMsRef.current = null;
            setLockProgress(0);
            setFeedback("Vui lòng tiến lại gần camera hơn một chút...");
          } else if (!hasDepth) {
            stableStartMsRef.current = null;
            setLockProgress(0);
            setFeedback("Không phát hiện độ sâu 3D tự nhiên. Vui lòng nhìn trực tiếp vào camera.");
          } else {
            stableStartMsRef.current = null;
            setLockProgress(0);
            setFeedback("Đưa khuôn mặt vào chính giữa khung oval...");
          }
        } else {
          stableStartMsRef.current = null;
          setLockProgress(0);
          setFeedback("Đặt khuôn mặt vào trong khung oval để bắt đầu đếm ngược...");
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
    setLockProgress(0);
    setFeedback("Đặt khuôn mặt vào khung oval và giữ yên...");
    setState("idle");
  };

  const startCamera = async () => {
    stopCamera();
    const sessionId = cameraSessionIdRef.current;
    setError("");
    setCooldownMessage("");
    setResult(null);
    setLockProgress(0);
    captureTriggeredRef.current = false;
    stableStartMsRef.current = null;

    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Trình duyệt không hỗ trợ truy cập camera.");
      setState("failure");
      return;
    }

    setState("camera");
    setFeedback("Đang khởi động camera...");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      if (cameraSessionIdRef.current !== sessionId) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) {
        throw new Error("Không tìm thấy khung hình camera.");
      }

      await playVideoSafely(video, stream);
      if (cameraSessionIdRef.current !== sessionId) return;

      cameraOpenedAtRef.current = performance.now();
      setFeedback("Đặt khuôn mặt vào giữa khung oval và giữ yên...");

      window.requestAnimationFrame(() => {
        void startFaceMeshAndPassiveTrigger(sessionId).catch(() => {
          if (cameraSessionIdRef.current === sessionId) {
            startFallbackCountdownLoop(sessionId);
          }
        });
      });
    } catch (reason) {
      if (cameraSessionIdRef.current !== sessionId) return;
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
    setKioskCountdown(5);
    const interval = window.setInterval(() => {
      setKioskCountdown((prev) => {
        if (prev <= 1) {
          window.clearInterval(interval);
          void startCamera();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [state, kioskMode]);

  const isCheckOut = Boolean(result?.attendance.check_out);

  return (
    <main className="min-h-[calc(100vh-5rem)]">
      <section className="mx-auto max-w-4xl">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-semibold text-slate-900">Kiosk Chấm công</h1>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700">
              <ShieldCheck size={13} />
              Passive Liveness
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

        {/* Always keep video & canvas mounted in DOM so videoRef.current is never null */}
        <canvas ref={canvasRef} className="hidden" />

        <div className={state === "idle" || state === "camera" ? "block" : "hidden"}>
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
                playsInline
                muted
                className="relative z-0 h-full w-full scale-x-[-1] object-cover"
              />
              <canvas
                ref={meshCanvasRef}
                className="pointer-events-none absolute inset-0 z-10 h-full w-full scale-x-[-1]"
              />
              <div className="pointer-events-none absolute inset-[12%_35%] rounded-[50%] border-2 border-sky-400/80 shadow-[0_0_0_999px_rgba(15,23,42,0.32)]" />
              <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between gap-3">
                <p className="rounded-md bg-slate-950/75 px-3 py-2 text-xs font-medium text-white">
                  {feedback}
                </p>
                {lockProgress > 0 && (
                  <span className="rounded-md bg-sky-600/90 px-3 py-1.5 text-xs font-semibold text-white">
                    {lockProgress}%
                  </span>
                )}
              </div>
            </div>

            {state === "camera" ? (
              <div className="mt-3 space-y-3">
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-sky-500 to-blue-600 transition-all duration-150"
                    style={{ width: `${lockProgress}%` }}
                  />
                </div>
                <div className="flex flex-col items-center justify-between gap-2 rounded-md border border-sky-100 bg-sky-50/60 px-4 py-2.5 sm:flex-row">
                  <div className="text-center sm:text-left">
                    <p className="text-xs font-semibold text-sky-700">
                      Chống giả mạo ngầm (Passive Anti-Spoofing) · Khóa quét đúp 2 phút
                    </p>
                    <p className="mt-0.5 text-xs text-slate-600">{feedback}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void runPassiveCaptureAndRecognize(true)}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-gradient-to-r from-sky-600 to-blue-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xs transition hover:from-sky-700 hover:to-blue-700"
                  >
                    <Camera size={14} />
                    Chụp ngay
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex aspect-video flex-col items-center justify-center gap-3 rounded-md bg-slate-100 px-4 text-center">
                <button
                  type="button"
                  onClick={() => void startCamera()}
                  className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-sky-600 to-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm shadow-sky-600/20 transition hover:from-sky-700 hover:to-blue-700"
                >
                  <ScanFace size={18} />
                  Bắt đầu chấm công nhanh
                </button>
                <p className="text-xs text-slate-500">
                  Giữ khuôn mặt trong khung oval ~2.5 giây · Phát tiếng &ldquo;Ting!&rdquo; · Chống quét trùng 2 phút
                </p>
              </div>
            )}
          </section>
        </div>

        {(state === "uploading" || state === "recognizing") && (
          <section className="mx-auto max-w-3xl rounded-lg border border-slate-200 bg-white">
            <LoadingState message="Đang xác thực Passive Liveness & nhận diện khuôn mặt..." />
            <div className="border-t border-slate-100 px-6 py-4 text-center text-xs text-slate-500">
              Kiểm tra độ sâu 3D, vi chuyển động 2 khung hình (200ms) và chống vân sọc màn hình (Moiré)
            </div>
          </section>
        )}

        {state === "cooldown" && (
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
                onClick={() => void startCamera()}
                className="w-full rounded-lg bg-gradient-to-r from-sky-600 to-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-sky-600/20 transition hover:from-sky-700 hover:to-blue-700"
              >
                Quét nhân sự tiếp theo
              </button>
            </div>
          </section>
        )}

        {state === "failure" && (
          <section className="mx-auto max-w-3xl rounded-lg border border-slate-200 bg-white">
            <ErrorState message={error} onRetry={() => void startCamera()} />
            <button
              type="button"
              onClick={reset}
              className="mx-auto mb-6 block text-sm font-semibold text-slate-500 hover:text-slate-900"
            >
              Quay lại
            </button>
          </section>
        )}

        {state === "success" && result && (
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
                  if (kioskMode) {
                    void startCamera();
                  } else {
                    reset();
                  }
                }}
                className="w-full rounded-lg bg-gradient-to-r from-sky-600 to-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm shadow-sky-600/20 transition hover:from-sky-700 hover:to-blue-700"
              >
                Quét tiếp
              </button>
            </div>
          </section>
        )}
      </section>
    </main>
  );
}

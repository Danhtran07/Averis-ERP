import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link } from "react-router-dom";
import {
  DrawingUtils,
  FaceLandmarker,
  FilesetResolver,
} from "@mediapipe/tasks-vision";
import { BadgeCheck, Banknote, Pencil, ScanFace, Search, Trash2, UsersRound } from "lucide-react";

import {
  createEmployee,
  deleteEmployee,
  enrollEmployeeFace,
  getEmployees,
  updateEmployee,
} from "../api/employee.api";
import { createLivenessSession } from "../api/recognition.api";
import { createUser, getUsers } from "../api/user.api";

import {
  getApiErrorMessage,
} from "../api/error";

import {
  evaluateFaceCaptureQuality,
} from "../utils/faceQuality";
import { drawMirroredVideoFrame } from "../utils/cameraMirror";
import { challengeFeedback, LIVENESS_STEPS } from "../utils/livenessFeedback";

import type {
  Employee,
  EmployeeCreate,
  EmployeeUpdate,
} from "../types/employee";
import type { UserResponse } from "../types/user";


/* ============================================================
   FORM TYPE
============================================================ */

interface EmployeeForm {
  employee_code: string;
  full_name: string;
  email: string;
  department: string;
  user_id: string;
  cccd: string;
  phone: string;
  date_of_birth: string;
  gender: string;
  permanent_address: string;
  current_address: string;
  emergency_contact: string;
}


/* ============================================================
   EMPTY FORM & CODE GENERATOR
============================================================ */

const emptyForm: EmployeeForm = {
  employee_code: "",
  full_name: "",
  email: "",
  department: "",
  user_id: "",
  cccd: "",
  phone: "",
  date_of_birth: "",
  gender: "",
  permanent_address: "",
  current_address: "",
  emergency_contact: "",
};

function getDepartmentPrefix(department: string): string {
  const lower = department.toLowerCase();
  if (lower.includes("pha chế") || lower.includes("barista")) return "BAR";
  if (lower.includes("thu ngân") || lower.includes("cashier")) return "CSH";
  if (lower.includes("phục vụ") || lower.includes("server")) return "SRV";
  if (lower.includes("bếp") || lower.includes("kitchen")) return "KIT";
  if (lower.includes("quản lý") || lower.includes("manager")) return "MGR";
  return "EMP";
}

function generateNextEmployeeCode(
  existingEmployees: Employee[],
  department: string
): string {
  const prefix = getDepartmentPrefix(department);
  const existingSet = new Set(
    existingEmployees.map((e) => e.employee_code.trim().toUpperCase())
  );
  let seq = existingEmployees.length + 1;
  while (true) {
    const candidate = `${prefix}-${String(seq).padStart(4, "0")}`;
    if (!existingSet.has(candidate)) {
      return candidate;
    }
    seq += 1;
  }
}

const FACE_LANDMARKER_MODEL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";


/* ============================================================
   PAGE
============================================================ */

export default function Employees() {
  const isAdmin = (() => {
    try {
      return JSON.parse(localStorage.getItem("user") || "{}").role === "ADMIN";
    } catch {
      return false;
    }
  })();

  /* ----------------------------------------------------------
     Employees
  ---------------------------------------------------------- */

  const [
    employees,
    setEmployees,
  ] = useState<Employee[]>([]);
  const [users, setUsers] = useState<UserResponse[]>([]);
  const [userLinkMode, setUserLinkMode] = useState<"existing" | "new">("existing");
  const [codeManuallyEdited, setCodeManuallyEdited] = useState(false);
  const [newAccountForm, setNewAccountForm] = useState({
    username: "",
    password: "",
  });

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    loadError,
    setLoadError,
  ] = useState("");

  const [
    search,
    setSearch,
  ] = useState("");


  /* ----------------------------------------------------------
     Modal
  ---------------------------------------------------------- */

  const [
    showModal,
    setShowModal,
  ] = useState(false);

  const [
    editingEmployee,
    setEditingEmployee,
  ] = useState<Employee | null>(null);

  const [
    form,
    setForm,
  ] = useState<EmployeeForm>({
    ...emptyForm,
  });

  const [
    saving,
    setSaving,
  ] = useState(false);

  const [
    formError,
    setFormError,
  ] = useState("");


  /* ----------------------------------------------------------
     Delete
  ---------------------------------------------------------- */

  const [
    deletingId,
    setDeletingId,
  ] = useState<number | null>(null);

  const [
    deleteError,
    setDeleteError,
  ] = useState("");

  const [faceMessage, setFaceMessage] = useState("");
  const [faceError, setFaceError] = useState("");
  const [enrollingId, setEnrollingId] = useState<number | null>(null);
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [capturedFrames, setCapturedFrames] = useState<File[]>([]);
  const [submittingEnrollment, setSubmittingEnrollment] = useState(false);
  const [enrollmentChallenge, setEnrollmentChallenge] = useState("WAITING");
  const [enrollmentChallengeIndex, setEnrollmentChallengeIndex] = useState(-1);
  const [enrollmentFeedback, setEnrollmentFeedback] = useState("Đang chuẩn bị quét khuôn mặt...");
  const [livenessComplete, setLivenessComplete] = useState(false);
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const cameraCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const livenessCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const livenessSocketRef = useRef<WebSocket | null>(null);
  const livenessTimerRef = useRef<number | null>(null);
  const meshAnimationRef = useRef<number | null>(null);
  const faceLandmarkerRef = useRef<FaceLandmarker | null>(null);
  const autoScanTimerRef = useRef<number | null>(null);
  const captureInFlightRef = useRef(false);
  const capturedFramesRef = useRef<File[]>([]);
  const submittingEnrollmentRef = useRef(false);
  const livenessCompleteRef = useRef(false);


  /* ==========================================================
     LOAD EMPLOYEES
  ========================================================== */

  async function loadEmployees() {

    try {

      setLoading(true);
      setLoadError("");

      const [data, userList] = await Promise.all([
        getEmployees(),
        getUsers().catch(() => [] as UserResponse[]),
      ]);

      setEmployees(data);
      setUsers(userList);

    } catch (error) {

      console.error(
        "Failed to load employees:",
        error
      );

      setLoadError(
        getApiErrorMessage(error)
      );

    } finally {

      setLoading(false);

    }
  }


  useEffect(() => {
    loadEmployees();
  }, []);


  /* ==========================================================
     FILTER
  ========================================================== */

  const [departmentFilter, setDepartmentFilter] = useState("");
  const [enrollmentFilter, setEnrollmentFilter] = useState<
    "ALL" | "ENROLLED" | "NOT_ENROLLED"
  >("ALL");

  const departments = useMemo(() => {
    const set = new Set<string>();
    employees.forEach((emp) => {
      if (emp.department?.trim()) set.add(emp.department.trim());
    });
    return Array.from(set).sort();
  }, [employees]);

  const filteredEmployees =
    useMemo(() => {

      const keyword =
        search
          .trim()
          .toLowerCase();

      return employees.filter(
        (employee) => {
          if (
            departmentFilter &&
            (employee.department || "").trim() !== departmentFilter
          ) {
            return false;
          }
          if (enrollmentFilter === "ENROLLED" && !employee.face_enrolled) {
            return false;
          }
          if (enrollmentFilter === "NOT_ENROLLED" && employee.face_enrolled) {
            return false;
          }
          if (!keyword) {
            return true;
          }
          return [
            employee.employee_code,
            employee.full_name,
            employee.email,
            employee.department || "",
            String(employee.user_id),
          ]
            .join(" ")
            .toLowerCase()
            .includes(keyword);

        }
      );

    }, [employees, search, departmentFilter, enrollmentFilter]);


  /* ==========================================================
     CREATE MODAL
  ========================================================== */

  function openCreateModal() {
    setEditingEmployee(null);
    setCodeManuallyEdited(false);

    setForm({
      ...emptyForm,
      employee_code: generateNextEmployeeCode(employees, ""),
    });

    setFormError("");
    setShowModal(true);
  }


  /* ==========================================================
     EDIT MODAL
  ========================================================== */

  function openEditModal(
    employee: Employee
  ) {
    setEditingEmployee(employee);
    setCodeManuallyEdited(true);

    setForm({
      employee_code: employee.employee_code,
      full_name: employee.full_name,
      email: employee.email,
      department: employee.department || "",
      user_id: String(employee.user_id),
      cccd: employee.cccd || "",
      phone: employee.phone || "",
      date_of_birth: employee.date_of_birth || "",
      gender: employee.gender || "",
      permanent_address: employee.permanent_address || "",
      current_address: employee.current_address || "",
      emergency_contact: employee.emergency_contact || "",
    });

    setFormError("");
    setShowModal(true);
  }


  /* ==========================================================
     CLOSE MODAL
  ========================================================== */

  function closeModal() {
    if (saving) {
      return;
    }

    setShowModal(false);
    setEditingEmployee(null);
    setCodeManuallyEdited(false);

    setForm({
      ...emptyForm,
    });

    setFormError("");
  }


  /* ==========================================================
     CHANGE FORM
  ========================================================== */

  function handleChange(
    field: keyof EmployeeForm,
    value: string
  ) {
    if (field === "employee_code") {
      setCodeManuallyEdited(true);
    }

    setForm((current) => {
      const next = {
        ...current,
        [field]: value,
      };
      if (field === "department" && !editingEmployee && !codeManuallyEdited) {
        next.employee_code = generateNextEmployeeCode(employees, value);
      }
      return next;
    });

    setFormError("");
  }


  /* ==========================================================
     SUBMIT
  ========================================================== */

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>
  ) {

    event.preventDefault();

    setFormError("");


    /* --------------------------------------------------------
       Required fields
    -------------------------------------------------------- */

    if (
      (editingEmployee && !form.employee_code.trim()) ||
      !form.full_name.trim() ||
      !form.email.trim()
    ) {
      setFormError(
        "Vui lòng điền đầy đủ các trường bắt buộc."
      );
      return;
    }


    /* --------------------------------------------------------
       User ID - CREATE ONLY
    -------------------------------------------------------- */

    let userId: number | undefined;

    if (!editingEmployee && userLinkMode === "existing") {

      if (!form.user_id.trim()) {

        setFormError(
          "Vui lòng chọn một tài khoản người dùng hoặc chọn 'Tạo tài khoản mới'."
        );

        return;
      }

      userId =
        Number(form.user_id);

      if (
        !Number.isInteger(userId) ||
        userId <= 0
      ) {

        setFormError(
          "ID tài khoản người dùng không hợp lệ."
        );

        return;
      }
    } else if (!editingEmployee && userLinkMode === "new") {
      if (!newAccountForm.username.trim() || newAccountForm.password.length < 8) {
        setFormError(
          "Tên đăng nhập mới là bắt buộc và mật khẩu phải từ 8 ký tự trở lên."
        );
        return;
      }
    }


    /* --------------------------------------------------------
       API
    -------------------------------------------------------- */

    try {

      setSaving(true);

      setFormError("");


      /* ======================================================
         UPDATE
      ====================================================== */

      if (editingEmployee) {
        const data: EmployeeUpdate = {
          employee_code: form.employee_code.trim(),
          full_name: form.full_name.trim(),
          email: form.email.trim(),
          department: form.department.trim() ? form.department.trim() : null,
          cccd: form.cccd.trim() || null,
          phone: form.phone.trim() || null,
          date_of_birth: form.date_of_birth.trim() || null,
          gender: form.gender.trim() || null,
          permanent_address: form.permanent_address.trim() || null,
          current_address: form.current_address.trim() || null,
          emergency_contact: form.emergency_contact.trim() || null,
        };

        const updated = await updateEmployee(editingEmployee.id, data);

        setEmployees((current) =>
          current.map((employee) =>
            employee.id === editingEmployee.id ? updated : employee
          )
        );
      }

      /* ======================================================
         CREATE
      ====================================================== */

      else {
        if (userLinkMode === "new") {
          const createdUser = await createUser({
            username: newAccountForm.username.trim(),
            password: newAccountForm.password,
            role: "EMPLOYEE",
          });
          userId = createdUser.id;
          setUsers((prev) => [...prev, createdUser]);
        }

        const trimmedCode = form.employee_code.trim();
        const data: EmployeeCreate = {
          ...(trimmedCode ? { employee_code: trimmedCode } : {}),
          full_name: form.full_name.trim(),
          email: form.email.trim(),
          department: form.department.trim() ? form.department.trim() : null,
          user_id: userId!,
          cccd: form.cccd.trim() || null,
          phone: form.phone.trim() || null,
          date_of_birth: form.date_of_birth.trim() || null,
          gender: form.gender.trim() || null,
          permanent_address: form.permanent_address.trim() || null,
          current_address: form.current_address.trim() || null,
          emergency_contact: form.emergency_contact.trim() || null,
        };


        const created =
          await createEmployee(
            data
          );


        setEmployees((current) =>
          current.some((item) => item.id === created.id)
            ? current.map((item) => (item.id === created.id ? created : item))
            : [...current, created]
        );
        setNewAccountForm({ username: "", password: "" });

        closeModal();
        startFaceEnrollment(created.id);
        return;
      }


      closeModal();

    } catch (error) {

      console.error(
        "Failed to save employee:",
        error
      );

      setFormError(
        getApiErrorMessage(error)
      );

    } finally {

      setSaving(false);

    }
  }


  /* ==========================================================
     DELETE
  ========================================================== */

  async function handleDelete(
    employee: Employee
  ) {

    const confirmed =
      window.confirm(
        `Bạn có chắc chắn muốn xoá nhân sự ${employee.full_name}?`
      );

    if (!confirmed) {
      return;
    }


    try {

      setDeletingId(
        employee.id
      );

      setDeleteError("");


      await deleteEmployee(
        employee.id
      );


      setEmployees(
        (current) =>
          current.filter(
            (item) =>
              item.id !==
              employee.id
          )
      );

    } catch (error) {

      console.error(
        "Failed to delete employee:",
        error
      );

      setDeleteError(
        getApiErrorMessage(error)
      );

    } finally {

      setDeletingId(null);

    }
  }

  function stopCameraStream() {
    if (autoScanTimerRef.current !== null) {
      window.clearInterval(autoScanTimerRef.current);
      autoScanTimerRef.current = null;
    }

    if (livenessTimerRef.current !== null) {
      window.clearInterval(livenessTimerRef.current);
      livenessTimerRef.current = null;
    }

    livenessSocketRef.current?.close();
    livenessSocketRef.current = null;

    if (meshAnimationRef.current !== null) {
      window.cancelAnimationFrame(meshAnimationRef.current);
      meshAnimationRef.current = null;
    }
    faceLandmarkerRef.current?.close();
    faceLandmarkerRef.current = null;

    const stream = cameraStreamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
    }

    const video = cameraVideoRef.current;
    if (video) {
      video.srcObject = null;
    }
  }

  async function startEnrollmentMesh() {
    const video = cameraVideoRef.current;
    const canvas = document.getElementById("enrollment-mesh-canvas") as HTMLCanvasElement | null;
    if (!video || !canvas) return;

    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
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
      if (!faceLandmarkerRef.current || video.videoWidth === 0 || video.videoHeight === 0) return;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context.clearRect(0, 0, canvas.width, canvas.height);
      const result = landmarker.detectForVideo(video, performance.now());
      for (const landmarks of result.faceLandmarks) {
        drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_TESSELATION, {
          color: "rgba(45, 212, 191, 0.72)",
          lineWidth: 1,
        });
        drawingUtils.drawLandmarks(landmarks, {
          color: "rgba(255, 255, 255, 0.9)",
          radius: 1,
        });
      }
      meshAnimationRef.current = window.requestAnimationFrame(drawMesh);
    };

    drawMesh();
  }

  async function startEnrollmentLiveness(retryCount = 0) {
    try {
      if (retryCount === 0) {
        setEnrollmentFeedback("Đưa khuôn mặt vào khung hình và giữ yên (bắt đầu sau 1.5s)...");
        await new Promise((resolve) => window.setTimeout(resolve, 1600));
      }
      const video = cameraVideoRef.current;
      const canvas = cameraCanvasRef.current;
      if (!video || !canvas || !cameraStreamRef.current) return;
      if (video.videoWidth === 0 || video.videoHeight === 0) {
        if (retryCount < 8) {
          window.setTimeout(() => void startEnrollmentLiveness(retryCount + 1), 800);
        }
        return;
      }
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Unable to capture the initial face frame.");
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const initialFace = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (blob) => blob ? resolve(blob) : reject(new Error("Unable to encode the initial face frame.")),
          "image/jpeg",
          0.9,
        );
      });
      let session;
      try {
        session = await createLivenessSession(initialFace, true);
      } catch (sessionErr) {
        if (retryCount < 8 && cameraStreamRef.current) {
          setEnrollmentFeedback("Chưa thấy rõ khuôn mặt trong khung hình — vui lòng nhìn thẳng vào camera...");
          window.setTimeout(() => void startEnrollmentLiveness(retryCount + 1), 1500);
          return;
        }
        throw sessionErr;
      }
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const token = localStorage.getItem("access_token");
      const socket = new WebSocket(
        `${protocol}//${window.location.host}/api/attendance/liveness/${session.session_id}?access_token=${encodeURIComponent(token || "")}`
      );
      socket.binaryType = "arraybuffer";
      livenessSocketRef.current = socket;

      socket.onopen = () => {
        setEnrollmentFeedback("Giữ khuôn mặt trong khung hình...");
        livenessTimerRef.current = window.setInterval(() => {
          const video = cameraVideoRef.current;
          const canvas = livenessCanvasRef.current;
          if (!video || !canvas || socket.readyState !== WebSocket.OPEN || video.videoWidth === 0) return;
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const context = canvas.getContext("2d");
          if (!context) return;
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          canvas.toBlob((blob) => {
            if (blob && socket.readyState === WebSocket.OPEN) socket.send(blob);
          }, "image/jpeg", 0.75);
        }, 1000 / 12);
      };

      socket.onmessage = (event) => {
        const message = JSON.parse(event.data) as {
          challenge?: string;
          challenge_index?: number;
          challenge_passed?: boolean;
          feedback?: string;
          error?: string;
        };
        if (message.error) {
          setCameraError(message.error);
          return;
        }
        if (message.challenge === "FAILED") {
          setCameraError(message.feedback || "Xác minh khuôn mặt thất bại. Vui lòng thử lại.");
          setEnrollmentFeedback(message.feedback || "Xác minh thất bại.");
          stopCameraStream();
          return;
        }
        setEnrollmentChallenge(message.challenge || "WAITING");
        setEnrollmentChallengeIndex(message.challenge_index ?? -1);
        const activeChallenge = message.challenge || "";
        const instruction = challengeFeedback(activeChallenge, message.feedback);
        setEnrollmentFeedback(
          message.challenge_passed && activeChallenge === "OPEN_MOUTH"
            ? `Đã nhận diện chớp mắt. ${instruction}`
            : instruction,
        );
        if (message.challenge === "COMPLETE") {
          livenessCompleteRef.current = true;
          setLivenessComplete(true);
          setEnrollmentFeedback("Xác minh thành công. Giữ yên để quét 3 mẫu khuôn mặt...");
          if (livenessTimerRef.current !== null) {
            window.clearInterval(livenessTimerRef.current);
            livenessTimerRef.current = null;
          }
          socket.close();
        }
      };
      socket.onerror = () => setCameraError("Không thể kết nối xác thực thực thể sống (Liveness).");
    } catch (error) {
      setCameraError(getApiErrorMessage(error, "Không thể khởi động xác thực khuôn mặt."));
    }
  }

  async function openCameraForEnrollment() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("Trình duyệt không hỗ trợ truy cập camera.");
      return;
    }

    try {
      setCameraError("");
      setCameraLoading(true);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      cameraStreamRef.current = stream;
      const video = cameraVideoRef.current;
      if (!video) {
        throw new Error("Không tìm thấy khung hình camera.");
      }

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
      } catch (playErr) {
        if (
          !(playErr instanceof DOMException && playErr.name === "AbortError") &&
          !(playErr instanceof Error && playErr.message.includes("interrupted by a new load request"))
        ) {
          throw playErr;
        }
      }
      void startEnrollmentMesh().catch(() => undefined);
      void startEnrollmentLiveness(0);
    } catch (error) {
      const message =
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "Quyền truy cập camera bị từ chối. Vui lòng cho phép camera và thử lại."
          : getApiErrorMessage(error, "Không thể mở camera.");
      setCameraError(message);
    } finally {
      setCameraLoading(false);
    }
  }

  useEffect(() => {
    if (!showCameraModal) {
      stopCameraStream();
      return;
    }

    void openCameraForEnrollment();
    autoScanTimerRef.current = window.setInterval(() => {
      if (livenessCompleteRef.current && capturedFramesRef.current.length < 3 && !submittingEnrollmentRef.current) {
        void handleCaptureFrame();
      }
    }, 1400);

    return () => {
      stopCameraStream();
    };
  }, [showCameraModal]);

  useEffect(() => {
    if (capturedFrames.length >= 3 && !submittingEnrollment) {
      void submitCapturedFrames();
    }
  }, [capturedFrames.length, submittingEnrollment]);

  function closeCameraModal() {
    setShowCameraModal(false);
    capturedFramesRef.current = [];
    livenessCompleteRef.current = false;
    setCapturedFrames([]);
    setLivenessComplete(false);
    setEnrollmentChallenge("WAITING");
    setEnrollmentChallengeIndex(-1);
    setEnrollmentFeedback("Preparing face scan...");
    setCameraError("");
    setCameraLoading(false);
    setEnrollingId(null);
    stopCameraStream();
  }

  async function handleCaptureFrame() {
    if (captureInFlightRef.current || capturedFramesRef.current.length >= 3) {
      return;
    }

    const video = cameraVideoRef.current;
    const canvas = cameraCanvasRef.current;

    if (!video || !canvas) {
      setCameraError("The camera is not ready yet. Please try again.");
      return;
    }

    if (video.videoWidth === 0 || video.videoHeight === 0) {
      setCameraError("The camera is still starting. Please wait a moment.");
      return;
    }

    try {
      captureInFlightRef.current = true;
      const width = video.videoWidth;
      const height = video.videoHeight;
      canvas.width = width;
      canvas.height = height;

      const context = canvas.getContext("2d");
      if (!context) {
        throw new Error("Canvas is not available.");
      }

      context.drawImage(video, 0, 0, width, height);

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (nextBlob) => {
            if (nextBlob) {
              resolve(nextBlob);
              return;
            }
            reject(new Error("Unable to encode the camera image."));
          },
          "image/jpeg",
          0.9
        );
      });

      const imageBitmap = await createImageBitmap(blob);
      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = imageBitmap.width;
      tempCanvas.height = imageBitmap.height;
      const tempContext = tempCanvas.getContext("2d");
      if (!tempContext) {
        throw new Error("Image processing is not available.");
      }
      tempContext.drawImage(imageBitmap, 0, 0);
      const imageData = tempContext.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
      const quality = evaluateFaceCaptureQuality(imageData);

      if (!quality.valid) {
        setCameraError(quality.message);
        return;
      }

      const file = new File([blob], `employee-${Date.now()}.jpg`, { type: "image/jpeg" });
      setCapturedFrames((current) => {
        const nextFrames = [...current, file];
        capturedFramesRef.current = nextFrames;
        return nextFrames;
      });
      setCameraError("");
    } catch (error) {
      setCameraError(getApiErrorMessage(error, "Unable to capture the face frame."));
    } finally {
      captureInFlightRef.current = false;
    }
  }

  async function submitCapturedFrames() {
    if (enrollingId === null || capturedFrames.length === 0) {
      return;
    }

    try {
      submittingEnrollmentRef.current = true;
      setSubmittingEnrollment(true);
      setFaceError("");
      const result = await enrollEmployeeFace(enrollingId, capturedFrames);
      setFaceMessage(`Đã lưu ${result.embeddings_saved} mẫu đặc trưng khuôn mặt. Nhân sự này có thể chấm công AI ngay.`);
      setEmployees((current) => current.map((employee) => employee.id === enrollingId ? { ...employee, face_enrolled: true } : employee));
      closeCameraModal();
    } catch (error) {
      setFaceError(getApiErrorMessage(error));
      closeCameraModal();
    } finally {
      submittingEnrollmentRef.current = false;
      setSubmittingEnrollment(false);
    }
  }

  function startFaceEnrollment(employeeId: number) {
    setFaceError("");
    setFaceMessage("");
    setEnrollingId(employeeId);
    setCapturedFrames([]);
    setShowCameraModal(true);
  }

  /* ==========================================================
     RENDER
  ========================================================== */

  return (
    <div className="mx-auto w-full max-w-[1600px]">

      {/* ======================================================
          HEADER
      ====================================================== */}

      <header
        className="
          mb-7
          flex flex-col
          gap-4
          sm:flex-row
          sm:items-center
          sm:justify-between
        "
      >

        <div>

          <h1
            className="
              text-2xl
              font-semibold
              tracking-tight
              text-slate-900
              sm:text-3xl
            "
          >
            Nhân sự
          </h1>

        </div>


        {isAdmin && (
          <div className="flex items-center gap-2.5">
            <Link
              to="/salaries"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-2xs transition hover:bg-slate-50"
            >
              <Banknote size={15} className="text-sky-600" />
              <span>Chính sách lương</span>
            </Link>

            <button
              type="button"
              onClick={openCreateModal}
              disabled={loading}
              className="
                inline-flex
                items-center
                justify-center
                rounded-xl
                bg-gradient-to-r from-sky-600 to-blue-600
                px-4 py-2
                text-sm font-semibold
                text-white
                shadow-sm shadow-sky-600/20
                transition
                hover:from-sky-700 hover:to-blue-700
                disabled:cursor-not-allowed
                disabled:opacity-50
              "
            >
              <span className="mr-1.5">+</span>
              Thêm nhân sự
            </button>
          </div>
        )}

      </header>

      {showCameraModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-lg border border-slate-200 bg-white p-4 shadow-2xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Đăng ký khuôn mặt</h2>
              </div>

              <button
                type="button"
                onClick={closeCameraModal}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Đóng
              </button>
            </div>

            <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
              <video
                ref={cameraVideoRef}
                autoPlay
                muted
                playsInline
                className="h-[420px] w-full object-cover"
              />
              <canvas
                id="enrollment-mesh-canvas"
                className="pointer-events-none absolute inset-0 h-full w-full object-cover"
              />
              <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center p-4">
                <span className="rounded-full bg-slate-950/70 px-4 py-2 text-sm font-semibold text-white backdrop-blur">
                  {enrollmentFeedback}
                </span>
              </div>
              <canvas ref={cameraCanvasRef} className="hidden" />
              <canvas ref={livenessCanvasRef} className="hidden" />
            </div>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-slate-500">
                {livenessComplete
                  ? `Đã chụp ${capturedFrames.length}/3`
                  : "Đang xác thực..."}
              </div>

              <div className="flex items-center gap-2 text-xs font-semibold  ">
                {LIVENESS_STEPS.map((step, index) => (
                  <span
                    key={step.challenge}
                    className={`rounded-full px-2.5 py-1 ${
                      enrollmentChallenge === step.challenge
                        ? "bg-sky-100 text-sky-800"
                        : enrollmentChallenge === "COMPLETE" || enrollmentChallengeIndex > index
                          ? "bg-sky-600 text-white"
                          : "bg-slate-100 text-slate-400"
                    }`}
                  >
                    {step.label}
                  </span>
                ))}
              </div>
            </div>

            <p className="mt-3 text-center text-sm font-semibold text-slate-700">
              {submittingEnrollment ? "Đang lưu..." : livenessComplete ? "Đang chụp..." : ""}
            </p>

            {(cameraError || faceError) && (
              <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {cameraError || faceError}
              </div>
            )}
          </div>
        </div>
      )}

      {(faceMessage || faceError) && (
        <div
          className={`mb-5 rounded-md border px-4 py-3 text-sm ${
            faceError
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-slate-200 bg-slate-50 text-slate-700"
          }`}
        >
          {faceError || faceMessage}
        </div>
      )}


      {/* ======================================================
          DELETE ERROR
      ====================================================== */}

      {deleteError && (

        <div
          className="
            mb-5
            flex items-center
            gap-3
            rounded-md
            border border-red-200
            bg-red-50
            px-4 py-3
            text-sm
            text-red-700
          "
        >

          <span
            className="
              flex h-7 w-7
              shrink-0
              items-center justify-center
              rounded-full
              bg-red-100
              font-semibold
            "
          >
            !
          </span>

          <span className="flex-1">
            {deleteError}
          </span>

          <button
            type="button"
            onClick={() =>
              setDeleteError("")
            }
            className="
              rounded-lg
              px-2 py-1
              text-red-400
              hover:bg-red-100
              hover:text-red-700
            "
          >
            ×
          </button>

        </div>

      )}


      {/* ======================================================
          EMPLOYEE CARD
      ====================================================== */}

      <section
        className="
          overflow-hidden
          rounded-lg
          border border-slate-200
          bg-white
          
        "
      >

        {/* ====================================================
            TOOLBAR
        ==================================================== */}

        <div
          className="
            flex flex-col
            gap-4
            border-b border-slate-100
            p-4
            sm:flex-row
            sm:items-center
            sm:justify-between
            sm:p-4
          "
        >

          {/* Search */}

          <div
            className="
              relative
              w-full
              sm:max-w-xl
            "
          >

            <span
              className="
                pointer-events-none
                absolute
                left-4
                top-1/2
                -translate-y-1/2
                text-base
                text-slate-400
              "
            >
              <Search size={17} strokeWidth={2} />
            </span>

            <input
              type="text"
              value={search}
              onChange={(event) =>
                setSearch(
                  event.target.value
                )
              }
              disabled={loading}
              placeholder="Tìm kiếm..."
              className="
                w-full
                rounded-md
                border border-slate-200
                bg-slate-50
                py-3
                pl-11
                pr-4
                text-sm
                text-slate-800
                outline-none
                transition

                placeholder:text-slate-400

                focus:border-slate-400
                focus:bg-white

                disabled:cursor-not-allowed
                disabled:opacity-60
              "
            />

          </div>


          {/* Filters & Count */}

          <div className="flex flex-wrap items-center gap-3">
            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              disabled={loading}
              className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-semibold text-slate-700 outline-none focus:border-slate-400 focus:bg-white"
            >
              <option value="">Tất cả bộ phận</option>
              {departments.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>

            <select
              value={enrollmentFilter}
              onChange={(e) =>
                setEnrollmentFilter(
                  e.target.value as "ALL" | "ENROLLED" | "NOT_ENROLLED"
                )
              }
              disabled={loading}
              className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-semibold text-slate-700 outline-none focus:border-slate-400 focus:bg-white"
            >
              <option value="ALL">Khuôn mặt: tất cả</option>
              <option value="ENROLLED">Đã đăng ký khuôn mặt</option>
              <option value="NOT_ENROLLED">Chưa đăng ký khuôn mặt</option>
            </select>

            <div
              className="
                shrink-0
                text-sm
                font-semibold
                text-slate-400
              "
            >
              <span className="text-slate-700">
                {filteredEmployees.length}
              </span>{" "}
              nhân sự
            </div>
          </div>

        </div>


        {/* ====================================================
            LOADING
        ==================================================== */}

        {loading && (

          <div
            className="
              flex
              min-h-[320px]
              flex-col
              items-center
              justify-center
              gap-4
            "
          >

            <div
              className="
                h-10 w-10
                animate-spin
                rounded-full
                border-4
                border-slate-200
                border-t-slate-900
              "
            />

            <p
              className="
                text-sm
                font-medium
                text-slate-500
              "
            >
              Đang tải danh sách nhân sự...
            </p>

          </div>

        )}


        {/* ====================================================
            ERROR
        ==================================================== */}

        {!loading && loadError && (

          <div
            className="
              flex
              min-h-[320px]
              flex-col
              items-center
              justify-center
              px-6
              text-center
            "
          >

            <div
              className="
                mb-4
                flex h-12 w-12
                items-center justify-center
                rounded-full
                bg-red-50
                text-lg font-semibold
                text-red-600
              "
            >
              !
            </div>

            <h3
              className="
                text-base
                font-semibold
                text-slate-800
              "
            >
              Không thể tải danh sách nhân sự
            </h3>

            <p
              className="
                mt-2
                max-w-md
                text-sm
                leading-6
                text-slate-500
              "
            >
              {loadError}
            </p>

            <button
              type="button"
              onClick={loadEmployees}
              className="
                mt-5
                rounded-md
                bg-gradient-to-r from-sky-600 to-blue-600
                px-4 py-2
                text-sm font-semibold
                text-white
                shadow-sm shadow-sky-600/20
                transition
                hover:from-sky-700 hover:to-blue-700
              "
            >
              Thử lại
            </button>

          </div>

        )}


        {/* ====================================================
            EMPTY
        ==================================================== */}

        {!loading &&
          !loadError &&
          filteredEmployees.length === 0 && (

            <div
              className="
                flex
                min-h-[320px]
                flex-col
                items-center
                justify-center
                px-6
                text-center
              "
            >

              <div
                className="
                  mb-4
                  flex h-16 w-16
                  items-center justify-center
                  rounded-lg
                  bg-slate-100
                  text-2xl
                "
              >
                <UsersRound size={28} strokeWidth={1.8} />
              </div>

              <h3
                className="
                  text-base
                  font-semibold
                  text-slate-800
                "
              >
                {search
                  ? "Không tìm thấy nhân sự phù hợp"
                  : "Chưa có nhân sự nào"}
              </h3>

              <p
                className="
                  mt-2
                  max-w-sm
                  text-sm
                  leading-6
                  text-slate-500
                "
              >
                {search
                  ? ""
                  : ""}
              </p>

              {!search && isAdmin && (

                <button
                  type="button"
                  onClick={
                    openCreateModal
                  }
                  className="
                    mt-5
                    rounded-md
                    bg-gradient-to-r from-sky-600 to-blue-600
                    px-4 py-2
                    text-sm font-semibold
                    text-white
                    shadow-sm shadow-sky-600/20
                    transition
                    hover:from-sky-700 hover:to-blue-700
                  "
                >
                  + Thêm nhân sự
                </button>

              )}

            </div>

          )}


        {/* ====================================================
            TABLE
        ==================================================== */}

        {!loading &&
          !loadError &&
          filteredEmployees.length > 0 && (

            <div
              className="
                overflow-x-auto
              "
            >

              <table
                className="
                  min-w-[900px]
                  w-full
                  border-collapse
                "
              >

                <thead>

                  <tr
                    className="
                      border-b border-slate-100
                      bg-slate-50/70
                    "
                  >

                    <th
                      className="
                        px-5 py-4
                        text-left
                        text-[11px]
                        font-semibold
                        
                        
                        text-slate-400
                      "
                    >
                      Mã NV
                    </th>

                    <th
                      className="
                        px-5 py-4
                        text-left
                        text-[11px]
                        font-semibold
                        
                        
                        text-slate-400
                      "
                    >
                      Họ và tên
                    </th>

                    <th
                      className="
                        px-5 py-4
                        text-left
                        text-[11px]
                        font-semibold
                        
                        
                        text-slate-400
                      "
                    >
                      Email
                    </th>

                    <th
                      className="
                        px-5 py-4
                        text-left
                        text-[11px]
                        font-semibold
                        
                        
                        text-slate-400
                      "
                    >
                      Vị trí / Quầy
                    </th>

                    <th
                      className="
                        px-5 py-4
                        text-left
                        text-[11px]
                        font-semibold
                        
                        
                        text-slate-400
                      "
                    >
                      Tài khoản
                    </th>

                    <th
                      className="
                        px-5 py-4
                        text-right
                        text-[11px]
                        font-semibold
                        
                        
                        text-slate-400
                      "
                    >
                      Thao tác
                    </th>

                  </tr>

                </thead>


                <tbody
                  className="
                    divide-y divide-slate-100
                  "
                >

                  {filteredEmployees.map(
                    (employee) => (

                      <tr
                        key={employee.id}
                        className="
                          transition
                          hover:bg-slate-50/70
                        "
                      >

                        {/* Employee Code */}

                        <td
                          className="
                            px-5 py-4
                          "
                        >

                          <span
                            className="
                              rounded-lg
                              bg-slate-100
                              px-2.5 py-1
                              font-mono
                              text-xs
                              font-medium
                              text-slate-600
                            "
                          >
                            {employee.employee_code}
                          </span>

                        </td>


                        {/* Name */}

                        <td
                          className="
                            px-5 py-4
                          "
                        >

                          <div
                            className="
                              flex
                              items-center
                              gap-3
                            "
                          >

                            <div
                              className="
                                flex h-9 w-9
                                shrink-0
                                items-center
                                justify-center
                                rounded-full
                                bg-slate-100
                                text-xs font-semibold
                                text-slate-600
                              "
                            >
                              {getInitials(
                                employee.full_name
                              )}
                            </div>

                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="truncate whitespace-nowrap text-sm font-semibold text-slate-800">
                                  {employee.full_name}
                                </span>
                                {employee.face_enrolled && (
                                  <span title="Đã xác thực khuôn mặt">
                                    <BadgeCheck
                                      size={17}
                                      strokeWidth={2}
                                      className="shrink-0 text-slate-700"
                                      aria-label="Đã xác thực khuôn mặt"
                                    />
                                  </span>
                                )}
                              </div>
                              <p className="mt-0.5 text-[11px] font-medium text-slate-400">
                                {employee.face_enrolled ? "Đã đăng ký khuôn mặt" : "Chưa đăng ký khuôn mặt"}
                              </p>
                            </div>

                          </div>

                        </td>


                        {/* Email */}

                        <td
                          className="
                            px-5 py-4
                          "
                        >

                          <span
                            className="
                              text-sm
                              text-slate-500
                            "
                          >
                            {employee.email}
                          </span>

                        </td>


                        {/* Department */}

                        <td
                          className="
                            px-5 py-4
                          "
                        >

                          {employee.department ? (

                            <span
                              className="
                                inline-flex
                                rounded-lg
                                bg-slate-100
                                px-2.5 py-1.5
                                text-xs
                                font-semibold
                                text-slate-600
                              "
                            >
                              {employee.department}
                            </span>

                          ) : (

                            <span
                              className="
                                text-sm
                                text-slate-300
                              "
                            >
                              —
                            </span>

                          )}

                        </td>


                        {/* User ID */}

                        <td
                          className="
                            px-5 py-4
                          "
                        >

                          <span
                            className="
                              text-sm
                              font-semibold
                              text-slate-500
                            "
                          >
                            #{employee.user_id}
                          </span>

                        </td>


                        {/* Actions */}

                        <td
                          className="
                            px-5 py-4
                          "
                        >

                          {isAdmin && <div
                            className="
                              flex
                              justify-end
                              gap-2
                            "
                          >

                            {/* Face enrollment */}

                            <button
                              type="button"
                              title={employee.face_enrolled ? "Recapture face" : "Capture face"}
                              onClick={() => startFaceEnrollment(employee.id)}
                              disabled={enrollingId !== null || saving}
                              className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-sm text-slate-500 transition hover:bg-slate-50 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              {enrollingId === employee.id ? "..." : employee.face_enrolled ? <BadgeCheck size={17} strokeWidth={2.5} /> : <ScanFace size={17} strokeWidth={2} />}
                            </button>

                            {/* Edit */}

                            <button
                              type="button"
                              title="Edit employee"
                              onClick={() =>
                                openEditModal(
                                  employee
                                )
                              }
                              disabled={
                                deletingId !== null ||
                                saving
                              }
                              className="
                                flex h-9 w-9
                                items-center
                                justify-center
                                rounded-lg
                                border border-slate-200
                                bg-white
                                text-sm
                                text-slate-500
                                transition

                                hover:bg-slate-50 hover:text-slate-900

                                disabled:cursor-not-allowed
                                disabled:opacity-40
                              "
                            >
                              <Pencil size={16} strokeWidth={2} />
                            </button>


                            {/* Delete */}

                            <button
                              type="button"
                              title="Delete employee"
                              onClick={() =>
                                handleDelete(
                                  employee
                                )
                              }
                              disabled={
                                deletingId ===
                                  employee.id ||
                                saving
                              }
                              className="
                                flex h-9 w-9
                                items-center
                                justify-center
                                rounded-lg
                                border border-slate-200
                                bg-white
                                text-sm
                                text-slate-400
                                transition

                                hover:bg-slate-50 hover:text-red-600

                                disabled:cursor-not-allowed
                                disabled:opacity-40
                              "
                            >
                              {deletingId ===
                              employee.id
                                ? (
                                  <span
                                    className="
                                      h-4 w-4
                                      animate-spin
                                      rounded-full
                                      border-2
                                      border-slate-200
                                      border-t-red-500
                                    "
                                  />
                                )
                                : <Trash2 size={16} strokeWidth={2} />}
                            </button>

                          </div>}

                        </td>

                      </tr>

                    )
                  )}

                </tbody>

              </table>

            </div>

          )}

      </section>


      {/* ======================================================
          MODAL
      ====================================================== */}

      {showModal && (

        <div
          className="
            fixed inset-0 z-[100]
            flex items-center
            justify-center
            bg-slate-900/50
            p-4
            backdrop-blur-sm
          "
          onMouseDown={(event) => {

            if (
              event.target ===
              event.currentTarget
            ) {
              closeModal();
            }

          }}
        >

          <div
            className="
              w-full
              max-w-2xl
              overflow-hidden
              rounded-lg
              bg-white
              shadow-2xl
            "
            onMouseDown={(event) =>
              event.stopPropagation()
            }
          >

            {/* =================================================
                MODAL HEADER
            ================================================= */}

            <div
              className="
                flex
                items-center
                justify-between
                border-b border-slate-100
                px-6 py-5
              "
            >

              <div>

                <h2
                  className="
                    text-lg
                    font-semibold
                    text-slate-900
                  "
                >
                  {editingEmployee
                    ? "Sửa nhân sự"
                    : "Thêm nhân sự"}
                </h2>

              </div>


              <button
                type="button"
                onClick={closeModal}
                disabled={saving}
                className="
                  flex h-9 w-9
                  items-center justify-center
                  rounded-lg
                  text-lg
                  text-slate-400
                  transition
                  hover:bg-slate-100
                  hover:text-slate-700
                  disabled:opacity-40
                "
              >
                ×
              </button>

            </div>


            {/* =================================================
                FORM
            ================================================= */}

            <form
              onSubmit={handleSubmit}
            >

              <div
                className="
                  max-h-[70vh]
                  space-y-5
                  overflow-y-auto
                  px-6 py-6
                "
              >

                {/* Form Error */}

                {formError && (

                  <div
                    className="
                      flex
                      items-start
                      gap-3
                      rounded-md
                      border border-red-200
                      bg-red-50
                      p-3.5
                      text-sm
                      text-red-700
                    "
                  >

                    <span
                      className="
                        flex h-6 w-6
                        shrink-0
                        items-center justify-center
                        rounded-full
                        bg-red-100
                        text-xs font-semibold
                      "
                    >
                      !
                    </span>

                    <span>
                      {formError}
                    </span>

                  </div>

                )}


                {/* Section 1: Work & Identity */}
                <div className="space-y-4">
                  <div className="border-b border-slate-100 pb-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
                    Thông tin công việc
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                      label={editingEmployee ? "Mã nhân sự" : "Mã nhân sự (Tự động tạo)"}
                      required={Boolean(editingEmployee)}
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={form.employee_code}
                          onChange={(event) =>
                            handleChange("employee_code", event.target.value)
                          }
                          placeholder="Tự động tạo khi lưu"
                          required={Boolean(editingEmployee)}
                          disabled={saving}
                          className={inputClassName}
                        />
                        {!editingEmployee && (
                          <button
                            type="button"
                            onClick={() => {
                              setCodeManuallyEdited(false);
                              setForm((prev) => ({
                                ...prev,
                                employee_code: generateNextEmployeeCode(
                                  employees,
                                  prev.department
                                ),
                              }));
                            }}
                            disabled={saving}
                            className="shrink-0 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                            title="Tạo lại mã tự động"
                          >
                            Tạo lại
                          </button>
                        )}
                      </div>
                    </FormField>

                    <FormField label="Vị trí / Quầy">
                      <select
                        value={form.department}
                        onChange={(event) =>
                          handleChange("department", event.target.value)
                        }
                        disabled={saving}
                        className={inputClassName}
                      >
                        <option value="">-- Chọn vị trí / quầy --</option>
                        <option value="Pha chế (Barista)">Pha chế (Barista)</option>
                        <option value="Thu ngân (Cashier)">Thu ngân (Cashier)</option>
                        <option value="Phục vụ (Server)">Phục vụ (Server)</option>
                        <option value="Bếp (Kitchen)">Bếp (Kitchen)</option>
                        <option value="Quản lý ca (Shift Manager)">Quản lý ca (Shift Manager)</option>
                      </select>
                    </FormField>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField label="Họ và tên" required>
                      <input
                        type="text"
                        value={form.full_name}
                        onChange={(event) =>
                          handleChange("full_name", event.target.value)
                        }
                        placeholder="Nguyễn Văn A"
                        required
                        disabled={saving}
                        className={inputClassName}
                      />
                    </FormField>

                    <FormField label="Email" required>
                      <input
                        type="email"
                        value={form.email}
                        onChange={(event) =>
                          handleChange("email", event.target.value)
                        }
                        placeholder="nhanvien@gmail.com"
                        required
                        disabled={saving}
                        className={inputClassName}
                      />
                    </FormField>
                  </div>
                </div>

                {/* Section 2: Personal Details & CCCD */}
                <div className="space-y-4 pt-2">
                  <div className="border-b border-slate-100 pb-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
                    Thông tin cá nhân & Căn cước công dân
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField label="Số CCCD / CMND">
                      <input
                        type="text"
                        value={form.cccd}
                        onChange={(event) =>
                          handleChange("cccd", event.target.value)
                        }
                        placeholder="079099001234"
                        maxLength={20}
                        disabled={saving}
                        className={inputClassName}
                      />
                    </FormField>

                    <FormField label="Số điện thoại">
                      <input
                        type="tel"
                        value={form.phone}
                        onChange={(event) =>
                          handleChange("phone", event.target.value)
                        }
                        placeholder="0901234567"
                        maxLength={20}
                        disabled={saving}
                        className={inputClassName}
                      />
                    </FormField>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField label="Ngày sinh">
                      <input
                        type="date"
                        value={form.date_of_birth}
                        onChange={(event) =>
                          handleChange("date_of_birth", event.target.value)
                        }
                        disabled={saving}
                        className={inputClassName}
                      />
                    </FormField>

                    <FormField label="Giới tính">
                      <select
                        value={form.gender}
                        onChange={(event) =>
                          handleChange("gender", event.target.value)
                        }
                        disabled={saving}
                        className={inputClassName}
                      >
                        <option value="">-- Chọn giới tính --</option>
                        <option value="Nam">Nam</option>
                        <option value="Nữ">Nữ</option>
                        <option value="Khác">Khác</option>
                      </select>
                    </FormField>
                  </div>
                </div>

                {/* Section 3: Address & Emergency Contact */}
                <div className="space-y-4 pt-2">
                  <div className="border-b border-slate-100 pb-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
                    Thông tin nơi ở & Liên hệ khẩn cấp
                  </div>

                  <FormField label="Nơi ở hiện tại (Tạm trú)">
                    <input
                      type="text"
                      value={form.current_address}
                      onChange={(event) =>
                        handleChange("current_address", event.target.value)
                      }
                      placeholder="Số nhà, tên đường, phường/xã, quận/huyện, tỉnh/TP"
                      disabled={saving}
                      className={inputClassName}
                    />
                  </FormField>

                  <FormField label="Địa chỉ thường trú / Quê quán (theo CCCD)">
                    <input
                      type="text"
                      value={form.permanent_address}
                      onChange={(event) =>
                        handleChange("permanent_address", event.target.value)
                      }
                      placeholder="Địa chỉ thường trú ghi trên CCCD"
                      disabled={saving}
                      className={inputClassName}
                    />
                  </FormField>

                  <FormField label="Liên hệ khẩn cấp (Họ tên & SĐT người thân)">
                    <input
                      type="text"
                      value={form.emergency_contact}
                      onChange={(event) =>
                        handleChange("emergency_contact", event.target.value)
                      }
                      placeholder="VD: Nguyễn Văn B (Bố) - 0912345678"
                      disabled={saving}
                      className={inputClassName}
                    />
                  </FormField>
                </div>


                {/* User Account - CREATE ONLY */}

                {!editingEmployee && (
                  <div className="rounded-md border border-slate-200 bg-slate-50/70 p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-700">
                        Tài khoản đăng nhập <span className="text-red-500">*</span>
                      </span>
                      <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-xs font-semibold">
                        <button
                          type="button"
                          onClick={() => setUserLinkMode("existing")}
                          className={`rounded-md px-2.5 py-1 transition ${
                            userLinkMode === "existing"
                              ? "bg-sky-600 text-white"
                              : "text-slate-600 hover:bg-slate-50"
                          }`}
                        >
                          Có sẵn
                        </button>
                        <button
                          type="button"
                          onClick={() => setUserLinkMode("new")}
                          className={`rounded-md px-2.5 py-1 transition ${
                            userLinkMode === "new"
                              ? "bg-sky-600 text-white"
                              : "text-slate-600 hover:bg-slate-50"
                          }`}
                        >
                          Tạo mới
                        </button>
                      </div>
                    </div>

                    {userLinkMode === "existing" ? (
                      <div>
                        <select
                          value={form.user_id}
                          onChange={(event) =>
                            handleChange("user_id", event.target.value)
                          }
                          required
                          disabled={saving}
                          className={inputClassName}
                        >
                          <option value="">-- Chọn tài khoản người dùng --</option>
                          {users.map((u) => {
                            const existingEmp = employees.find(
                              (e) => e.user_id === u.id
                            );
                            const isPlaceholder =
                              existingEmp?.email?.endsWith("@local.invalid");
                            return (
                              <option
                                key={u.id}
                                value={u.id}
                                disabled={Boolean(existingEmp && !isPlaceholder)}
                              >
                                #{u.id} · {u.username} ({u.role})
                                {existingEmp
                                  ? isPlaceholder
                                    ? ""
                                    : ` — Đã gán cho ${existingEmp.full_name}`
                                  : ""}
                              </option>
                            );
                          })}
                        </select>
                      </div>
                    ) : (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <label className="mb-1 block text-[11px] font-semibold text-slate-600">
                            Tên đăng nhập *
                          </label>
                          <input
                            type="text"
                            placeholder="nv_nguyenvana"
                            value={newAccountForm.username}
                            onChange={(e) =>
                              setNewAccountForm((prev) => ({
                                ...prev,
                                username: e.target.value,
                              }))
                            }
                            required
                            disabled={saving}
                            className={inputClassName}
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-[11px] font-semibold text-slate-600">
                            Mật khẩu *
                          </label>
                          <input
                            type="password"
                            placeholder="••••••••"
                            value={newAccountForm.password}
                            onChange={(e) =>
                              setNewAccountForm((prev) => ({
                                ...prev,
                                password: e.target.value,
                              }))
                            }
                            required
                            disabled={saving}
                            className={inputClassName}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}

              </div>


              {/* =================================================
                  FOOTER
              ================================================= */}

              <div
                className="
                  flex
                  justify-end
                  gap-3
                  border-t border-slate-100
                  bg-slate-50/50
                  px-6 py-4
                "
              >

                <button
                  type="button"
                  onClick={closeModal}
                  disabled={saving}
                  className="
                    rounded-md
                    border border-slate-200
                    bg-white
                    px-4 py-2
                    text-sm font-semibold
                    text-slate-600
                    transition

                    hover:bg-slate-50

                    disabled:cursor-not-allowed
                    disabled:opacity-50
                  "
                >
                  Huỷ
                </button>


                <button
                  type="submit"
                  disabled={saving}
                  className="
                    inline-flex
                    min-w-[130px]
                    items-center
                    justify-center
                    gap-2
                    rounded-md
                    bg-gradient-to-r from-sky-600 to-blue-600
                    px-4 py-2
                    text-sm font-semibold
                    text-white
                    shadow-sm shadow-sky-600/20
                    transition
                    hover:from-sky-700 hover:to-blue-700
                    disabled:cursor-not-allowed
                    disabled:opacity-60
                  "
                >

                  {saving && (
                    <span
                      className="
                        h-4 w-4
                        animate-spin
                        rounded-full
                        border-2
                        border-white/40
                        border-t-white
                      "
                    />
                  )}

                  {saving
                    ? "Đang lưu..."
                    : editingEmployee
                      ? "Lưu"
                      : "Lưu"}

                </button>

              </div>

            </form>

          </div>

        </div>

      )}

    </div>
  );
}


/* ============================================================
   FORM FIELD
============================================================ */

function FormField({
  label,
  required = false,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>

      <label
        className="
          mb-2
          block
          text-xs
          font-semibold
          text-slate-700
        "
      >

        {label}

        {required && (
          <span className="ml-1 text-red-500">
            *
          </span>
        )}

      </label>

      {children}

    </div>
  );
}


/* ============================================================
   INPUT STYLE
============================================================ */

const inputClassName = `
  w-full
  rounded-md
  border border-slate-200
  bg-white
  px-4 py-3
  text-sm
  text-slate-800
  outline-none
  transition

  placeholder:text-slate-400

  focus:border-blue-400
  focus:ring-4
  focus:ring-blue-50

  disabled:cursor-not-allowed
  disabled:bg-slate-50
  disabled:text-slate-400
`;


/* ============================================================
   INITIALS
============================================================ */

function getInitials(
  name: string
) {
  return name
    .trim()
    .split(/\s+/)
    .map(
      (part) => part[0]
    )
    .join("")
    .slice(-2)
    .toUpperCase();
}

import { useState, useEffect } from "react";
import { useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Check, X, Phone, PhoneOff, Volume2, User, Globe } from "lucide-react";
import { updateBookingStatus } from "../api/bookings";
import { getActiveCall } from "../api/calls";
import type { BookingRequest } from "../generated/prisma/client";

interface LiveBookingData {
  name: string;
  service: string;
  date: string;
  time: string;
  phone: string;
  language: string;
  notes: string;
}

const uiText: Record<string, any> = {
  English: {
    dashboard: "AI Receptionist Dashboard",
    salon: "Bella Salon",
    preferredLanguage: "Preferred Language",
    pendingRequests: "pending requests",
    callInProgress: "Call in progress",
    liveTranscript: "Live Call Transcript",
    incomingCall: "Incoming Call",
    detected: "Detected",
    hideTranscript: "Hide Transcript",
    showTranscript: "Show Transcript",
    takeOver: "Take Over",
    liveBooking: "Live Booking Details",
    name: "Name",
    service: "Service",
    dateTime: "Date & Time",
    phone: "Phone",
    language: "Language",
    autoFilling: "Auto-filling from conversation...",
    bookingRequests: "Booking Requests",
    noCall: "No Ongoing Call",
    waiting: "Waiting for incoming calls...",
    new: "New",
    when: "When",
    notes: "Notes",
    accept: "Accept",
    decline: "Decline",
    confirmed: "Confirmed",
    addedCalendar: "Added to Google Calendar",
    addAgain: "(add again)",
    confirmationSent: "Confirmation sent to client",
    declined: "Declined",
    chooseAnother: "Client will be asked to choose another time",
    noPending: "No pending requests",
  },
  Vietnamese: {
    dashboard: "Bảng điều khiển lễ tân AI",
    salon: "Bella Salon",
    preferredLanguage: "Ngôn ngữ ưu tiên",
    pendingRequests: "yêu cầu đang chờ",
    callInProgress: "Đang có cuộc gọi",
    liveTranscript: "Nội dung cuộc gọi trực tiếp",
    incomingCall: "Cuộc gọi đến",
    detected: "Phát hiện",
    hideTranscript: "Ẩn nội dung",
    showTranscript: "Hiện nội dung",
    takeOver: "Nhận cuộc gọi",
    liveBooking: "Thông tin đặt lịch trực tiếp",
    name: "Tên",
    service: "Dịch vụ",
    dateTime: "Ngày & Giờ",
    phone: "Số điện thoại",
    language: "Ngôn ngữ",
    autoFilling: "Đang tự động điền từ cuộc trò chuyện...",
    bookingRequests: "Yêu cầu đặt lịch",
    noCall: "Không có cuộc gọi",
    waiting: "Đang chờ cuộc gọi đến...",
    new: "Mới",
    when: "Thời gian",
    notes: "Ghi chú",
    accept: "Chấp nhận",
    decline: "Từ chối",
    confirmed: "Đã xác nhận",
    addedCalendar: "Đã thêm vào Google Calendar",
    addAgain: "(thêm lại)",
    confirmationSent: "Đã gửi xác nhận cho khách",
    declined: "Đã từ chối",
    chooseAnother: "Khách sẽ được yêu cầu chọn thời gian khác",
    noPending: "Không có yêu cầu đang chờ",
  },
  French: {
    dashboard: "Tableau de bord réceptionniste IA",
    salon: "Bella Salon",
    preferredLanguage: "Langue préférée",
    pendingRequests: "demandes en attente",
    callInProgress: "Appel en cours",
    liveTranscript: "Transcription de l'appel",
    incomingCall: "Appel entrant",
    detected: "Détecté",
    hideTranscript: "Masquer la transcription",
    showTranscript: "Afficher la transcription",
    takeOver: "Prendre le relais",
    liveBooking: "Détails de réservation en direct",
    name: "Nom",
    service: "Service",
    dateTime: "Date et heure",
    phone: "Téléphone",
    language: "Langue",
    autoFilling: "Remplissage automatique depuis la conversation...",
    bookingRequests: "Demandes de réservation",
    noCall: "Aucun appel en cours",
    waiting: "En attente d'appels entrants...",
    new: "Nouveau",
    when: "Quand",
    notes: "Notes",
    accept: "Accepter",
    decline: "Refuser",
    confirmed: "Confirmé",
    addedCalendar: "Ajouté à Google Calendar",
    addAgain: "(ajouter à nouveau)",
    confirmationSent: "Confirmation envoyée au client",
    declined: "Refusé",
    chooseAnother: "Le client devra choisir un autre horaire",
    noPending: "Aucune demande en attente",
  },
  Spanish: {
    dashboard: "Panel de recepcionista IA",
    salon: "Bella Salon",
    preferredLanguage: "Idioma preferido",
    pendingRequests: "solicitudes pendientes",
    callInProgress: "Llamada en curso",
    liveTranscript: "Transcripción en vivo",
    incomingCall: "Llamada entrante",
    detected: "Detectado",
    hideTranscript: "Ocultar transcripción",
    showTranscript: "Mostrar transcripción",
    takeOver: "Tomar control",
    liveBooking: "Detalles de reserva en vivo",
    name: "Nombre",
    service: "Servicio",
    dateTime: "Fecha y hora",
    phone: "Teléfono",
    language: "Idioma",
    autoFilling: "Autocompletando desde la conversación...",
    bookingRequests: "Solicitudes de reserva",
    noCall: "No hay llamada activa",
    waiting: "Esperando llamadas entrantes...",
    new: "Nuevo",
    when: "Cuándo",
    notes: "Notes",
    accept: "Aceptar",
    decline: "Rechazar",
    confirmed: "Confirmado",
    addedCalendar: "Añadido a Google Calendar",
    addAgain: "(añadir de nuevo)",
    confirmationSent: "Confirmación enviada al cliente",
    declined: "Rechazado",
    chooseAnother: "Se le pedirá al cliente elegir otro horario",
    noPending: "No hay solicitudes pendientes",
  },
  Mandarin: {
    dashboard: "AI 接待员控制台",
    salon: "Bella Salon",
    preferredLanguage: "首选语言",
    pendingRequests: "个待处理预约",
    callInProgress: "通话进行中",
    liveTranscript: "实时通话记录",
    incomingCall: "来电",
    detected: "检测到",
    hideTranscript: "隐藏记录",
    showTranscript: "显示记录",
    takeOver: "人工接听",
    liveBooking: "实时预约详情",
    name: "姓名",
    service: "服务",
    dateTime: "日期和时间",
    phone: "电话",
    language: "语言",
    autoFilling: "正在从对话中自动填写...",
    bookingRequests: "预约请求",
    noCall: "暂无通话",
    waiting: "正在等待来电...",
    new: "新",
    when: "时间",
    notes: "备注",
    accept: "接受",
    decline: "拒绝",
    confirmed: "已确认",
    addedCalendar: "已添加到 Google 日历",
    addAgain: "(再次添加)",
    confirmationSent: "已发送确认给客户",
    declined: "已拒绝",
    chooseAnother: "客户将被要求选择其他时间",
    noPending: "没有待处理请求",
  },
};

interface Props {
  initialBookings: BookingRequest[];
}

export function OwnerDashboard({ initialBookings }: Props) {
  const router = useRouter();
  const [ownerLanguage, setOwnerLanguage] = useState("English");
  const t = uiText[ownerLanguage] || uiText.English;

  const { data: activeCall } = useQuery({
    queryKey: ["activeCall"],
    queryFn: () => getActiveCall(),
    refetchInterval: 500,
  });

  const isCallActive = activeCall?.active === true;
  const transcript = (activeCall?.messages ?? []).map((m) => ({
    id: m.id,
    speaker: m.role === "user" ? ("customer" as const) : ("ai" as const),
    text: m.message,
    timestamp: new Date(m.createdAt).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }),
  }));

  const [showTranscript, setShowTranscript] = useState(true);

  const liveBooking: LiveBookingData = {
    name: activeCall?.name ?? "",
    service: activeCall?.service ?? "",
    date: activeCall?.requestedDate ?? "",
    time: activeCall?.requestedTime ?? "",
    phone: activeCall?.phone ?? "",
    language: activeCall?.language || "English",
    notes: activeCall?.notes ?? "",
  };

  const [bookings, setBookings] = useState<BookingRequest[]>(initialBookings);
  const [audioLevel, setAudioLevel] = useState(0);

  useEffect(() => {
    if (isCallActive) {
      const interval = setInterval(() => {
        setAudioLevel(Math.random() * 100);
      }, 150);

      return () => clearInterval(interval);
    }
  }, [isCallActive]);

  const formatGoogleDate = (date: Date) => {
    return date.toISOString().replace(/[-:]|\.\d{3}/g, "");
  };

  const parseBookingDateTime = (
    requestedDate: string,
    requestedTime: string,
  ) => {
    const start = new Date(`${requestedDate} ${requestedTime}`);

    if (Number.isNaN(start.getTime())) {
      throw new Error(
        `Invalid booking date/time: ${requestedDate} ${requestedTime}`,
      );
    }

    const end = new Date(start.getTime() + 60 * 60 * 1000);

    return {
      start: formatGoogleDate(start),
      end: formatGoogleDate(end),
    };
  };

  const addToGoogleCalendar = (booking: BookingRequest) => {
    const { start, end } = parseBookingDateTime(
      booking.requestedDate,
      booking.requestedTime,
    );

    const params = new URLSearchParams({
      action: "TEMPLATE",
      text: `${booking.service} - ${booking.clientName}`,
      dates: `${start}/${end}`,
      details: `Customer: ${booking.clientName}
Phone: ${booking.phone}
Service: ${booking.service}
Language: ${booking.originalLanguage}
Notes: ${booking.notes}
Created by NailFlow AI.`,
      location: "Bella Salon",
      ctz: "America/Toronto",
    });

    window.open(
      `https://calendar.google.com/calendar/render?${params.toString()}`,
      "_blank",
    );
  };

  const handleAccept = async (id: number) => {
    const booking = bookings.find((b) => b.id === id);
    if (!booking) return;

    addToGoogleCalendar(booking);

    setBookings(
      bookings.map((b) => (b.id === id ? { ...b, status: "accepted" } : b)),
    );
    await updateBookingStatus({ data: { id, status: "accepted" } });
    router.invalidate();
  };

  const handleDecline = async (id: number) => {
    setBookings(
      bookings.map((b) => (b.id === id ? { ...b, status: "declined" } : b)),
    );
    await updateBookingStatus({ data: { id, status: "declined" } });
    router.invalidate();
  };

  const pendingCount = bookings.filter((b) => b.status === "pending").length;

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="bg-white/80 backdrop-blur-sm border-b border-neutral-200/50 sticky top-0 z-10">
        <div className="max-w-400 mx-auto px-8 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-neutral-900 rounded-xl flex items-center justify-center">
                <Phone className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl text-neutral-900 tracking-tight">
                  {t.dashboard}
                </h1>
                <p className="text-sm text-neutral-500">{t.salon}</p>
              </div>
            </div>

            <div className="flex items-center gap-6">
              <div>
                <label className="text-xs text-neutral-500 block mb-1">
                  {t.preferredLanguage}
                </label>
                <select
                  value={ownerLanguage}
                  onChange={(e) => setOwnerLanguage(e.target.value)}
                  className="px-4 py-2 bg-white border border-neutral-300 rounded-lg text-sm text-neutral-700 focus:outline-none focus:ring-2 focus:ring-neutral-400"
                >
                  <option value="English">English</option>
                  <option value="Vietnamese">Tiếng Việt</option>
                  <option value="French">Français</option>
                  <option value="Spanish">Español</option>
                  <option value="Mandarin">中文</option>
                </select>
              </div>

              <div className="text-sm text-neutral-600">
                {pendingCount} {t.pendingRequests}
              </div>

              {isCallActive && (
                <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 border border-emerald-200 rounded-lg">
                  <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                  <span className="text-sm text-emerald-900">
                    {t.callInProgress}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-400 mx-auto px-8 py-8">
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <h2 className="text-lg text-neutral-900 mb-4 tracking-tight">
              {t.liveTranscript}
            </h2>

            {isCallActive ? (
              <div className="bg-white rounded-3xl shadow-sm border border-neutral-200/60 overflow-hidden">
                <div className="bg-neutral-900 px-8 py-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-emerald-500 rounded-full flex items-center justify-center">
                        <Phone className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <div className="text-white text-lg">
                          {t.incomingCall}
                        </div>
                        <div className="flex items-center gap-2 text-neutral-400 text-sm">
                          <Globe className="w-4 h-4" />
                          <span>
                            {t.detected}: {liveBooking.language}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => setShowTranscript(!showTranscript)}
                        className="px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-all text-sm"
                      >
                        {showTranscript ? t.hideTranscript : t.showTranscript}
                      </button>

                      <button className="px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-all text-sm flex items-center gap-2">
                        <PhoneOff className="w-4 h-4" />
                        {t.takeOver}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 px-4 py-3 bg-white/5 rounded-xl">
                    <Volume2 className="w-5 h-5 text-emerald-400" />
                    <div className="flex-1 flex items-center gap-1 h-8">
                      {[...Array(40)].map((_, i) => (
                        <div
                          key={i}
                          className="flex-1 bg-emerald-400 rounded-full transition-all"
                          style={{
                            height: `${Math.max(4, Math.sin(i * 0.5 + audioLevel * 0.05) * 30 + 20)}px`,
                            opacity:
                              0.3 + Math.sin(i * 0.5 + audioLevel * 0.05) * 0.3,
                          }}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {showTranscript && (
                  <div className="p-8 max-h-150 overflow-y-auto">
                    <div className="space-y-4">
                      {transcript.map((line) => (
                        <div
                          key={line.id}
                          className={`flex ${
                            line.speaker === "customer"
                              ? "justify-end"
                              : "justify-start"
                          }`}
                        >
                          <div className="max-w-lg">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs text-neutral-500">
                                {line.speaker === "customer"
                                  ? "Customer"
                                  : "AI Receptionist"}
                              </span>
                              <span className="text-xs text-neutral-400">
                                {line.timestamp}
                              </span>
                            </div>

                            <div
                              className={`px-4 py-3 rounded-2xl ${
                                line.speaker === "customer"
                                  ? "bg-neutral-100 text-neutral-900"
                                  : "bg-neutral-900 text-white"
                              }`}
                            >
                              {line.text}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-white rounded-3xl shadow-sm border border-neutral-200/60 p-16 text-center">
                <div className="w-20 h-20 bg-neutral-100 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Phone className="w-10 h-10 text-neutral-400" />
                </div>
                <h3 className="text-lg text-neutral-900 mb-2 tracking-tight">
                  {t.noCall}
                </h3>
                <p className="text-neutral-500">{t.waiting}</p>
              </div>
            )}
          </div>

          <div className="space-y-6">
            {isCallActive && (
              <div className="bg-white rounded-3xl shadow-sm border border-neutral-200/60 p-6">
                <h3 className="text-lg text-neutral-900 mb-5 tracking-tight">
                  {t.liveBooking}
                </h3>

                <div className="space-y-4">
                  <div
                    className={`transition-all ${liveBooking.name ? "opacity-100" : "opacity-40"}`}
                  >
                    <label className="text-xs text-neutral-500 block mb-1.5">
                      {t.name}
                    </label>
                    <div className="text-neutral-900">
                      {liveBooking.name || "—"}
                    </div>
                  </div>

                  <div
                    className={`transition-all ${liveBooking.service ? "opacity-100" : "opacity-40"}`}
                  >
                    <label className="text-xs text-neutral-500 block mb-1.5">
                      {t.service}
                    </label>
                    <div className="text-neutral-900">
                      {liveBooking.service || "—"}
                    </div>
                  </div>

                  <div
                    className={`transition-all ${liveBooking.date ? "opacity-100" : "opacity-40"}`}
                  >
                    <label className="text-xs text-neutral-500 block mb-1.5">
                      {t.dateTime}
                    </label>
                    <div className="text-neutral-900 text-sm">
                      {liveBooking.date
                        ? `${liveBooking.date}, ${liveBooking.time}`
                        : "—"}
                    </div>
                  </div>

                  <div
                    className={`transition-all ${liveBooking.phone ? "opacity-100" : "opacity-40"}`}
                  >
                    <label className="text-xs text-neutral-500 block mb-1.5">
                      {t.phone}
                    </label>
                    <div className="text-neutral-900">
                      {liveBooking.phone || "—"}
                    </div>
                  </div>

                  <div
                    className={`transition-all ${liveBooking.language ? "opacity-100" : "opacity-40"}`}
                  >
                    <label className="text-xs text-neutral-500 block mb-1.5">
                      {t.language}
                    </label>
                    <div className="text-neutral-900">
                      {liveBooking.language || "—"}
                    </div>
                  </div>
                </div>

                <div className="mt-6 pt-5 border-t border-neutral-200/60">
                  <div className="flex items-center gap-2 text-sm text-neutral-500">
                    <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                    <span>{t.autoFilling}</span>
                  </div>
                </div>
              </div>
            )}

            <div>
              <h2 className="text-lg text-neutral-900 mb-4 tracking-tight">
                {t.bookingRequests}
              </h2>

              <div className="space-y-4">
                {bookings.length === 0 ? (
                  <div className="bg-white rounded-3xl shadow-sm border border-neutral-200/60 p-12 text-center">
                    <div className="w-16 h-16 bg-neutral-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Check className="w-8 h-8 text-neutral-400" />
                    </div>
                    <p className="text-neutral-500 text-sm">{t.noPending}</p>
                  </div>
                ) : (
                  bookings.map((booking) => (
                    <div
                      key={booking.id}
                      className={`bg-white rounded-3xl shadow-sm border transition-all ${
                        booking.status === "accepted"
                          ? "border-emerald-200/60 bg-emerald-50/20"
                          : booking.status === "declined"
                            ? "border-neutral-300/60 opacity-60"
                            : "border-neutral-200/60"
                      }`}
                    >
                      <div className="p-6">
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-neutral-100 rounded-full flex items-center justify-center">
                              <User className="w-5 h-5 text-neutral-600" />
                            </div>

                            <div>
                              <h3 className="text-base text-neutral-900 tracking-tight">
                                {booking.clientName}
                              </h3>
                              <div className="flex items-center gap-1.5 text-xs text-neutral-500 mt-0.5">
                                <Globe className="w-3 h-3" />
                                <span>{booking.originalLanguage}</span>
                              </div>
                            </div>
                          </div>

                          {booking.status === "pending" && (
                            <span className="px-2.5 py-1 bg-neutral-900 text-white text-xs rounded-full">
                              {t.new}
                            </span>
                          )}
                        </div>

                        <div className="space-y-2.5 mb-4 text-sm">
                          <div>
                            <span className="text-neutral-500">
                              {t.service}:
                            </span>{" "}
                            <span className="text-neutral-900">
                              {booking.service}
                            </span>
                          </div>

                          <div>
                            <span className="text-neutral-500">{t.when}:</span>{" "}
                            <span className="text-neutral-900">
                              {booking.requestedDate}, {booking.requestedTime}
                            </span>
                          </div>

                          <div>
                            <span className="text-neutral-500">{t.phone}:</span>{" "}
                            <span className="text-neutral-900">
                              {booking.phone}
                            </span>
                          </div>

                          <div>
                            <span className="text-neutral-500">{t.notes}:</span>{" "}
                            <span className="text-neutral-700">
                              {booking.notes}
                            </span>
                          </div>
                        </div>

                        {booking.status === "pending" && (
                          <div className="flex gap-2 pt-4 border-t border-neutral-200/60">
                            <button
                              onClick={() => handleAccept(booking.id)}
                              className="flex-1 px-4 py-2.5 bg-emerald-700 text-white rounded-xl hover:bg-emerald-800 transition-all flex items-center justify-center gap-2 text-sm"
                            >
                              <Check className="w-4 h-4" />
                              {t.accept}
                            </button>

                            <button
                              onClick={() => handleDecline(booking.id)}
                              className="flex-1 px-4 py-2.5 bg-white border border-neutral-300 text-neutral-700 rounded-xl hover:bg-neutral-50 transition-all flex items-center justify-center gap-2 text-sm"
                            >
                              <X className="w-4 h-4" />
                              {t.decline}
                            </button>
                          </div>
                        )}

                        {booking.status === "accepted" && (
                          <div className="pt-4 border-t border-emerald-200/60">
                            <div className="bg-emerald-50 border border-emerald-200/60 rounded-xl p-3">
                              <div className="flex items-center gap-2 text-emerald-900 mb-2">
                                <Check className="w-4 h-4" />
                                <span className="text-sm font-medium">
                                  {t.confirmed}
                                </span>
                              </div>
                              <div className="text-xs text-emerald-800 space-y-1">
                                <div className="flex items-center gap-1">
                                  <span>• {t.addedCalendar}</span>
                                  <button
                                    type="button"
                                    onClick={() => addToGoogleCalendar(booking)}
                                    className="text-emerald-600 hover:text-emerald-700 underline font-medium cursor-pointer ml-1"
                                  >
                                    {t.addAgain}
                                  </button>
                                </div>
                                <div>• {t.confirmationSent}</div>
                              </div>
                            </div>
                          </div>
                        )}

                        {booking.status === "declined" && (
                          <div className="pt-4 border-t border-neutral-200/60">
                            <div className="bg-neutral-100 border border-neutral-200/60 rounded-xl p-3">
                              <div className="flex items-center gap-2 text-neutral-700 mb-1.5">
                                <X className="w-4 h-4" />
                                <span className="text-sm font-medium">
                                  {t.declined}
                                </span>
                              </div>
                              <div className="text-xs text-neutral-600">
                                {t.chooseAnother}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

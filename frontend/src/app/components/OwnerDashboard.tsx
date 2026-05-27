import { useState, useEffect } from "react";
import { Check, X, Phone, PhoneOff, Volume2, User, Globe } from "lucide-react";

interface BookingRequest {
  id: number;
  clientName: string;
  service: string;
  requestedDate: string;
  requestedTime: string;
  originalLanguage: string;
  phone: string;
  notes: string;
  status: "pending" | "accepted" | "declined";
}

interface TranscriptLine {
  id: number;
  speaker: "customer" | "ai";
  text: string;
  timestamp: string;
}

interface LiveBookingData {
  name: string;
  service: string;
  date: string;
  time: string;
  phone: string;
  language: string;
  notes: string;
}

const demoTranscript: TranscriptLine[] = [
  { id: 1, speaker: "ai", text: "Bonjour! Merci d'avoir appelé Bella Salon. Comment puis-je vous aider aujourd'hui?", timestamp: "14:32:01" },
  { id: 2, speaker: "customer", text: "Bonjour, je voudrais prendre rendez-vous pour une coupe de cheveux.", timestamp: "14:32:08" },
  { id: 3, speaker: "ai", text: "Parfait! Je serais ravi de vous aider. Quel est votre nom?", timestamp: "14:32:12" },
  { id: 4, speaker: "customer", text: "Je m'appelle Sophie Martin.", timestamp: "14:32:16" },
  { id: 5, speaker: "ai", text: "Merci Sophie. Quel jour vous conviendrait le mieux?", timestamp: "14:32:19" },
  { id: 6, speaker: "customer", text: "Peut-être jeudi prochain vers 15h si possible?", timestamp: "14:32:24" },
  { id: 7, speaker: "ai", text: "Jeudi 5 juin à 15h00, c'est parfait. Puis-je avoir votre numéro de téléphone?", timestamp: "14:32:28" },
  { id: 8, speaker: "customer", text: "Oui, c'est le 555-0192.", timestamp: "14:32:33" },
  { id: 9, speaker: "ai", text: "Merci! J'ai bien noté votre rendez-vous. Vous recevrez une confirmation par SMS.", timestamp: "14:32:37" },
];

const mockBookings: BookingRequest[] = [
  {
    id: 1,
    clientName: "Maria Garcia",
    service: "Haircut & Highlights",
    requestedDate: "June 2, 2026",
    requestedTime: "2:30 PM",
    originalLanguage: "Spanish",
    phone: "+1 (555) 123-4567",
    notes: "Regular customer, prefers stylist Ana",
    status: "pending"
  },
  {
    id: 2,
    clientName: "Ahmed Hassan",
    service: "Car Oil Change",
    requestedDate: "June 3, 2026",
    requestedTime: "9:00 AM",
    originalLanguage: "Arabic",
    phone: "+1 (555) 234-5678",
    notes: "2018 Toyota Camry",
    status: "pending"
  }
];

export function OwnerDashboard() {
  const [isCallActive, setIsCallActive] = useState(true);
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [transcriptIndex, setTranscriptIndex] = useState(0);
  const [showTranscript, setShowTranscript] = useState(true);
  const [liveBooking, setLiveBooking] = useState<LiveBookingData>({
    name: "",
    service: "",
    date: "",
    time: "",
    phone: "",
    language: "French",
    notes: ""
  });
  const [bookings, setBookings] = useState<BookingRequest[]>(mockBookings);
  const [audioLevel, setAudioLevel] = useState(0);

  useEffect(() => {
    if (isCallActive && transcriptIndex < demoTranscript.length) {
      const timer = setTimeout(() => {
        setTranscript(prev => [...prev, demoTranscript[transcriptIndex]]);
        setTranscriptIndex(transcriptIndex + 1);

        if (transcriptIndex === 3) {
          setLiveBooking(prev => ({ ...prev, name: "Sophie Martin" }));
        } else if (transcriptIndex === 4) {
          setLiveBooking(prev => ({ ...prev, service: "Haircut" }));
        } else if (transcriptIndex === 6) {
          setLiveBooking(prev => ({ ...prev, date: "June 5, 2026", time: "3:00 PM" }));
        } else if (transcriptIndex === 8) {
          setLiveBooking(prev => ({ ...prev, phone: "+1 (555) 555-0192" }));
        }
      }, 3000);

      return () => clearTimeout(timer);
    } else if (transcriptIndex >= demoTranscript.length && isCallActive) {
      const endTimer = setTimeout(() => {
        setIsCallActive(false);
        const newBooking: BookingRequest = {
          id: bookings.length + 1,
          clientName: liveBooking.name,
          service: liveBooking.service,
          requestedDate: liveBooking.date,
          requestedTime: liveBooking.time,
          originalLanguage: liveBooking.language,
          phone: liveBooking.phone,
          notes: "Walk-in preferred",
          status: "pending"
        };
        setBookings([newBooking, ...bookings]);
      }, 2000);

      return () => clearTimeout(endTimer);
    }
  }, [transcriptIndex, isCallActive, bookings, liveBooking]);

  useEffect(() => {
    if (isCallActive) {
      const interval = setInterval(() => {
        setAudioLevel(Math.random() * 100);
      }, 150);
      return () => clearInterval(interval);
    }
  }, [isCallActive]);

  const handleAccept = (id: number) => {
    setBookings(bookings.map(booking =>
      booking.id === id ? { ...booking, status: "accepted" as const } : booking
    ));
  };

  const handleDecline = (id: number) => {
    setBookings(bookings.map(booking =>
      booking.id === id ? { ...booking, status: "declined" as const } : booking
    ));
  };

  const handleTakeOver = () => {
    setIsCallActive(false);
  };

  const pendingCount = bookings.filter(b => b.status === "pending").length;

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="bg-white/80 backdrop-blur-sm border-b border-neutral-200/50 sticky top-0 z-10">
        <div className="max-w-[1600px] mx-auto px-8 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-neutral-900 rounded-xl flex items-center justify-center">
                <Phone className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl text-neutral-900 tracking-tight">AI Receptionist Dashboard</h1>
                <p className="text-sm text-neutral-500">Bella Salon</p>
              </div>
            </div>
            <div className="flex items-center gap-6">
              <div>
                <label className="text-xs text-neutral-500 block mb-1">Preferred Language</label>
                <select
                  value={liveBooking.language}
                  onChange={(e) => setLiveBooking(prev => ({ ...prev, language: e.target.value }))}
                  className="px-4 py-2 bg-white border border-neutral-300 rounded-lg text-sm text-neutral-700 focus:outline-none focus:ring-2 focus:ring-neutral-400"
                >
                  <option value="English">English</option>
                  <option value="Spanish">Español</option>
                  <option value="French">Français</option>
                  <option value="Arabic">العربية</option>
                  <option value="Mandarin">中文</option>
                  <option value="Hindi">हिन्दी</option>
                </select>
              </div>
              <div className="text-sm text-neutral-600">
                {pendingCount} pending request{pendingCount !== 1 ? 's' : ''}
              </div>
              {isCallActive && (
                <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 border border-emerald-200 rounded-lg">
                  <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                  <span className="text-sm text-emerald-900">Call in progress</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-[1600px] mx-auto px-8 py-8">
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <h2 className="text-lg text-neutral-900 mb-4 tracking-tight">Live Call Transcript</h2>
            {isCallActive ? (
              <div className="bg-white rounded-3xl shadow-sm border border-neutral-200/60 overflow-hidden">
                <div className="bg-neutral-900 px-8 py-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-emerald-500 rounded-full flex items-center justify-center">
                        <Phone className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <div className="text-white text-lg">Incoming Call</div>
                        <div className="flex items-center gap-2 text-neutral-400 text-sm">
                          <Globe className="w-4 h-4" />
                          <span>Detected: {liveBooking.language}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setShowTranscript(!showTranscript)}
                        className="px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-all text-sm"
                      >
                        {showTranscript ? "Hide" : "Show"} Transcript
                      </button>
                      <button
                        onClick={handleTakeOver}
                        className="px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-all text-sm flex items-center gap-2"
                      >
                        <PhoneOff className="w-4 h-4" />
                        Take Over
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
                            opacity: 0.3 + (Math.sin(i * 0.5 + audioLevel * 0.05) * 0.3)
                          }}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {showTranscript && (
                  <div className="p-8 max-h-[600px] overflow-y-auto">
                    <div className="space-y-4">
                      {transcript.map((line) => (
                        <div
                          key={line.id}
                          className={`flex ${line.speaker === "customer" ? "justify-end" : "justify-start"}`}
                        >
                          <div className="max-w-lg">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs text-neutral-500">
                                {line.speaker === "customer" ? "Customer" : "AI Receptionist"}
                              </span>
                              <span className="text-xs text-neutral-400">{line.timestamp}</span>
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
                <h3 className="text-lg text-neutral-900 mb-2 tracking-tight">No Ongoing Call</h3>
                <p className="text-neutral-500">Waiting for incoming calls...</p>
              </div>
            )}
          </div>

          <div className="space-y-6">
            {isCallActive && (
              <div className="bg-white rounded-3xl shadow-sm border border-neutral-200/60 p-6">
                <h3 className="text-lg text-neutral-900 mb-5 tracking-tight">Live Booking Details</h3>
                <div className="space-y-4">
                  <div className={`transition-all ${liveBooking.name ? 'opacity-100' : 'opacity-40'}`}>
                    <label className="text-xs text-neutral-500 block mb-1.5">Name</label>
                    <div className="text-neutral-900">{liveBooking.name || "—"}</div>
                  </div>
                  <div className={`transition-all ${liveBooking.service ? 'opacity-100' : 'opacity-40'}`}>
                    <label className="text-xs text-neutral-500 block mb-1.5">Service</label>
                    <div className="text-neutral-900">{liveBooking.service || "—"}</div>
                  </div>
                  <div className={`transition-all ${liveBooking.date ? 'opacity-100' : 'opacity-40'}`}>
                    <label className="text-xs text-neutral-500 block mb-1.5">Date & Time</label>
                    <div className="text-neutral-900 text-sm">
                      {liveBooking.date ? `${liveBooking.date}, ${liveBooking.time}` : "—"}
                    </div>
                  </div>
                  <div className={`transition-all ${liveBooking.phone ? 'opacity-100' : 'opacity-40'}`}>
                    <label className="text-xs text-neutral-500 block mb-1.5">Phone</label>
                    <div className="text-neutral-900">{liveBooking.phone || "—"}</div>
                  </div>
                  <div className={`transition-all ${liveBooking.language ? 'opacity-100' : 'opacity-40'}`}>
                    <label className="text-xs text-neutral-500 block mb-1.5">Language</label>
                    <div className="text-neutral-900">{liveBooking.language || "—"}</div>
                  </div>
                </div>

                <div className="mt-6 pt-5 border-t border-neutral-200/60">
                  <div className="flex items-center gap-2 text-sm text-neutral-500">
                    <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                    <span>Auto-filling from conversation...</span>
                  </div>
                </div>
              </div>
            )}

            <div>
              <h2 className="text-lg text-neutral-900 mb-4 tracking-tight">Booking Requests</h2>
              <div className="space-y-4">
                {bookings.length === 0 ? (
                  <div className="bg-white rounded-3xl shadow-sm border border-neutral-200/60 p-12 text-center">
                    <div className="w-16 h-16 bg-neutral-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Check className="w-8 h-8 text-neutral-400" />
                    </div>
                    <p className="text-neutral-500 text-sm">No pending requests</p>
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
                              <h3 className="text-base text-neutral-900 tracking-tight">{booking.clientName}</h3>
                              <div className="flex items-center gap-1.5 text-xs text-neutral-500 mt-0.5">
                                <Globe className="w-3 h-3" />
                                <span>{booking.originalLanguage}</span>
                              </div>
                            </div>
                          </div>
                          {booking.status === "pending" && (
                            <span className="px-2.5 py-1 bg-neutral-900 text-white text-xs rounded-full">
                              New
                            </span>
                          )}
                        </div>

                        <div className="space-y-2.5 mb-4 text-sm">
                          <div>
                            <span className="text-neutral-500">Service:</span>{" "}
                            <span className="text-neutral-900">{booking.service}</span>
                          </div>
                          <div>
                            <span className="text-neutral-500">When:</span>{" "}
                            <span className="text-neutral-900">{booking.requestedDate}, {booking.requestedTime}</span>
                          </div>
                          <div>
                            <span className="text-neutral-500">Phone:</span>{" "}
                            <span className="text-neutral-900">{booking.phone}</span>
                          </div>
                          <div>
                            <span className="text-neutral-500">Notes:</span>{" "}
                            <span className="text-neutral-700">{booking.notes}</span>
                          </div>
                        </div>

                        {booking.status === "pending" && (
                          <div className="flex gap-2 pt-4 border-t border-neutral-200/60">
                            <button
                              onClick={() => handleAccept(booking.id)}
                              className="flex-1 px-4 py-2.5 bg-emerald-700 text-white rounded-xl hover:bg-emerald-800 transition-all flex items-center justify-center gap-2 text-sm"
                            >
                              <Check className="w-4 h-4" />
                              Accept
                            </button>
                            <button
                              onClick={() => handleDecline(booking.id)}
                              className="flex-1 px-4 py-2.5 bg-white border border-neutral-300 text-neutral-700 rounded-xl hover:bg-neutral-50 transition-all flex items-center justify-center gap-2 text-sm"
                            >
                              <X className="w-4 h-4" />
                              Decline
                            </button>
                          </div>
                        )}

                        {booking.status === "accepted" && (
                          <div className="pt-4 border-t border-emerald-200/60">
                            <div className="bg-emerald-50 border border-emerald-200/60 rounded-xl p-3">
                              <div className="flex items-center gap-2 text-emerald-900 mb-2">
                                <Check className="w-4 h-4" />
                                <span className="text-sm font-medium">Confirmed</span>
                              </div>
                              <div className="text-xs text-emerald-800 space-y-1">
                                <div>• Added to Google Calendar</div>
                                <div>• Confirmation sent to client</div>
                              </div>
                            </div>
                          </div>
                        )}

                        {booking.status === "declined" && (
                          <div className="pt-4 border-t border-neutral-200/60">
                            <div className="bg-neutral-100 border border-neutral-200/60 rounded-xl p-3">
                              <div className="flex items-center gap-2 text-neutral-700 mb-1.5">
                                <X className="w-4 h-4" />
                                <span className="text-sm font-medium">Declined</span>
                              </div>
                              <div className="text-xs text-neutral-600">
                                Client will be asked to choose another time
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

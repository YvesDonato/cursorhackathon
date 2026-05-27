import { useState, useRef, useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { Send, Mic, MicOff } from "lucide-react";

interface Message {
  id: number;
  text: string;
  sender: "customer" | "ai";
}

interface ExtractedInfo {
  name: string;
  service: string;
  date: string;
  time: string;
  phone: string;
  notes: string;
}

const languageGreetings: Record<string, string> = {
  English: "Hello! I'm your AI booking assistant. What service would you like to book?",
  Spanish: "¡Hola! Soy tu asistente de reservas de IA. ¿Qué servicio te gustaría reservar?",
  French: "Bonjour! Je suis votre assistant de réservation IA. Quel service souhaitez-vous réserver?",
  Arabic: "مرحبا! أنا مساعد الحجز الخاص بك. ما الخدمة التي تريد حجزها؟",
  Mandarin: "你好！我是您的人工智能预订助手。您想预订什么服务？",
  Hindi: "नमस्ते! मैं आपका एआई बुकिंग सहायक हूं। आप कौन सी सेवा बुक करना चाहेंगे?"
};

export function CustomerBooking() {
  const [messages, setMessages] = useState<Message[]>([
    { id: 1, text: "Hello! I'm your AI booking assistant. What service would you like to book?", sender: "ai" }
  ]);
  const [inputValue, setInputValue] = useState("");
  const [selectedLanguage, setSelectedLanguage] = useState("English");
  const [extractedInfo, setExtractedInfo] = useState<ExtractedInfo>({
    name: "",
    service: "",
    date: "",
    time: "",
    phone: "",
    notes: ""
  });
  const [showSubmit, setShowSubmit] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;

      recognitionRef.current.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInputValue(transcript);
        setIsListening(false);
      };

      recognitionRef.current.onerror = () => {
        setIsListening(false);
        setSpeechError("Could not capture audio. Please try again.");
        setTimeout(() => setSpeechError(null), 3000);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    }
  }, []);

  const handleLanguageChange = (language: string) => {
    setSelectedLanguage(language);
    const greeting: Message = {
      id: messages.length + 1,
      text: languageGreetings[language],
      sender: "ai"
    };
    setMessages([greeting]);
  };

  const handleSendMessage = () => {
    if (!inputValue.trim()) return;

    const newMessage: Message = {
      id: messages.length + 1,
      text: inputValue,
      sender: "customer"
    };

    setMessages([...messages, newMessage]);
    setInputValue("");

    setTimeout(() => {
      const aiResponse: Message = {
        id: messages.length + 2,
        text: selectedLanguage === "English"
          ? "Perfect! I've collected your details. Please review them on the right."
          : "Perfect! I've collected your details. Please review them.",
        sender: "ai"
      };
      setMessages(prev => [...prev, aiResponse]);

      setExtractedInfo({
        name: "Maria Garcia",
        service: "Haircut & Style",
        date: "June 2, 2026",
        time: "2:30 PM",
        phone: "+1 (555) 123-4567",
        notes: "First time customer"
      });
      setShowSubmit(true);
    }, 1000);
  };

  const toggleListening = () => {
    if (!recognitionRef.current) {
      setSpeechError("Voice input is not supported in this browser.");
      setTimeout(() => setSpeechError(null), 3000);
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      recognitionRef.current.start();
      setIsListening(true);
      setSpeechError(null);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-6 py-12">
      <div className="mb-8">
        <Link
          to="/"
          className="inline-flex px-4 py-2 bg-neutral-900 text-white rounded-lg hover:bg-neutral-800 transition-all text-sm"
        >
          Owner Dashboard
        </Link>
      </div>
      <div className="text-center mb-12">
        <h1 className="text-3xl text-neutral-900 mb-3 tracking-tight">Book Your Appointment</h1>
        <p className="text-neutral-500">Chat with our AI assistant in your preferred language</p>
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <div className="bg-white rounded-3xl shadow-sm border border-neutral-200/60 overflow-hidden">
            <div className="bg-neutral-50 px-8 py-5 border-b border-neutral-200/60 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-neutral-900 rounded-xl flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                  </svg>
                </div>
                <span className="text-neutral-900">AI Assistant</span>
              </div>
              <select
                value={selectedLanguage}
                onChange={(e) => handleLanguageChange(e.target.value)}
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

            <div className="h-[480px] overflow-y-auto p-8 space-y-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.sender === "customer" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-xs lg:max-w-md px-5 py-3.5 rounded-2xl ${
                      message.sender === "customer"
                        ? "bg-neutral-900 text-white"
                        : "bg-neutral-100 text-neutral-800"
                    }`}
                  >
                    {message.text}
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-neutral-200/60 p-6">
              {speechError && (
                <div className="mb-3 px-4 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  {speechError}
                </div>
              )}
              <div className="flex gap-3">
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyPress={(e) => e.key === "Enter" && handleSendMessage()}
                  placeholder="Type your message..."
                  className="flex-1 px-5 py-3.5 border border-neutral-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-neutral-400 focus:border-transparent bg-white text-neutral-900"
                />
                <button
                  onClick={handleSendMessage}
                  className="px-5 py-3.5 bg-neutral-900 text-white rounded-xl hover:bg-neutral-800 transition-all"
                >
                  <Send className="w-5 h-5" />
                </button>
                <button
                  onClick={toggleListening}
                  className={`px-5 py-3.5 rounded-xl transition-all ${
                    isListening
                      ? "bg-red-100 text-red-700 hover:bg-red-200"
                      : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
                  }`}
                >
                  {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </button>
              </div>
              {isListening && (
                <div className="mt-3 text-sm text-neutral-600 flex items-center gap-2">
                  <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                  Listening...
                </div>
              )}
            </div>
          </div>
        </div>

        <div>
          <div className="bg-white rounded-3xl shadow-sm border border-neutral-200/60 p-8">
            <h3 className="text-lg text-neutral-900 mb-6 tracking-tight">Booking Details</h3>
            <div className="space-y-5">
              <div>
                <label className="text-xs text-neutral-500 block mb-1.5">Name</label>
                <div className="text-neutral-900">{extractedInfo.name || "—"}</div>
              </div>
              <div>
                <label className="text-xs text-neutral-500 block mb-1.5">Service</label>
                <div className="text-neutral-900">{extractedInfo.service || "—"}</div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-neutral-500 block mb-1.5">Date</label>
                  <div className="text-neutral-900 text-sm">{extractedInfo.date || "—"}</div>
                </div>
                <div>
                  <label className="text-xs text-neutral-500 block mb-1.5">Time</label>
                  <div className="text-neutral-900 text-sm">{extractedInfo.time || "—"}</div>
                </div>
              </div>
              <div>
                <label className="text-xs text-neutral-500 block mb-1.5">Phone</label>
                <div className="text-neutral-900">{extractedInfo.phone || "—"}</div>
              </div>
              <div>
                <label className="text-xs text-neutral-500 block mb-1.5">Notes</label>
                <div className="text-neutral-700 text-sm">{extractedInfo.notes || "—"}</div>
              </div>
            </div>

            {showSubmit && (
              <button className="w-full mt-8 px-5 py-3.5 bg-emerald-700 text-white rounded-xl hover:bg-emerald-800 transition-all">
                Submit Booking Request
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

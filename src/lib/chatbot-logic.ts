export interface KnowledgeBase {
  [key: string]: {
    keywords: string[];
    response: string | string[];
  };
}

export const knowledgeBase: KnowledgeBase = {
  greetings: {
    keywords: ["hello", "hi", "hey"],
    response: "Hello! I'm the StellarCare Assistant. How can I help you today? You can ask me about our services, prices, contact information, or how to book an appointment.",
  },
  about: {
    keywords: ["about", "clinic", "who are you", "location", "where"],
    response: "Dr. Rana Dental Clinic is located in New Mata Gujri Enclave, Janta Nagar, Mundi Kharar. We provide a wide range of dental services from routine check-ups to advanced procedures.",
  },
  services: {
    keywords: ["services", "offer", "do", "what", "treatments"],
    response: [
      "We offer a comprehensive range of dental services, including:",
      "- Teeth Cleaning & Polishing",
      "- Fillings and Sealants",
      "- Tooth Extractions",
      "- Root Canal Therapy",
      "- Cosmetic Dentistry",
      "- Dental Implants, Veneers, and Crowns",
      "- Oral Surgery and Periodontal Care",
      "Is there a specific service you'd like to know more about?",
    ],
  },
  pricing: {
    keywords: ["price", "cost", "how much", "fee", "fees"],
    response: [
        "Here are some of our starting prices:",
        "- Teeth Cleaning: from Rs. 1,000",
        "- Fillings: from Rs. 1,000",
        "- Extractions: from Rs. 800",
        "- Root Canals: from Rs. 3,000",
        "- Dental Implants: from Rs. 20,000",
        "- X-Ray: Rs. 300",
        "Please note that these are starting prices and the final cost may vary depending on the case.",
    ]
  },
  contact: {
    keywords: ["contact", "phone", "address", "number", "email"],
    response: "You can reach us at 090414 81946. Our clinic is located at: New Mata Gujri Enclave, Gurudwara Sahib Road, Janta Nagar, Mundi Kharar, Kharar, Punjab 140301.",
  },
  booking: {
    keywords: ["book", "appointment", "schedule", "visit"],
    response: 'You can easily book an appointment through our website. Just navigate to the "Booking" page or click this link: /booking',
  },
  technology: {
    keywords: ["technology", "x-ray", "scanner", "sterilization", "teledentistry", "equipment", "facilities"],
    response: "We use modern dental technology including low-radiation Digital X-Rays, high-precision Intraoral Scanners for digital impressions, and maintain strict standards for instrument sterilization. We also offer teledentistry for follow-up care.",
  },
  fallback: {
    keywords: [],
    response: "I'm sorry, I can't answer that question right now. I can help with questions about our services, pricing, location, and booking appointments. How can I assist you?",
  },
};

export const getBotResponse = (userInput: string): string => {
  const lowerCaseInput = userInput.toLowerCase();

  // Specific service checks
  if (lowerCaseInput.includes("cleaning")) return "Professional teeth cleaning and scaling starts from Rs. 1,000.";
  if (lowerCaseInput.includes("filling")) return "Tooth-colored composite fillings and sealants start from Rs. 1,000.";
  if (lowerCaseInput.includes("extraction")) return "Safe and gentle tooth extractions start from Rs. 800.";
  if (lowerCaseInput.includes("root canal")) return "Root canal treatments to save a damaged tooth start from Rs. 3,000.";
  if (lowerCaseInput.includes("implant")) return "Dental implants, a permanent solution for missing teeth, start from Rs. 20,000.";
  if (lowerCaseInput.includes("cosmetic") || lowerCaseInput.includes("smile")) return "We offer various cosmetic procedures like teeth whitening and veneers starting from Rs. 1,500 to enhance your smile.";

  for (const key in knowledgeBase) {
    const category = knowledgeBase[key];
    if (category.keywords.some(keyword => lowerCaseInput.includes(keyword))) {
      const response = category.response;
      return Array.isArray(response) ? response.join("\\n") : response;
    }
  }

  return knowledgeBase.fallback.response as string;
};

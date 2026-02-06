import { GoogleGenAI } from "@google/genai";

const getClient = () => {
  const apiKey = process.env.API_KEY || ''; // In a real app, handle missing key gracefully
  return new GoogleGenAI({ apiKey });
};

export const refineText = async (roughText: string): Promise<string> => {
  if (!process.env.API_KEY) {
    console.warn("No API Key found for Gemini");
    return roughText + " (AI Unavailable - Check API Key)";
  }

  try {
    const ai = getClient();
    // Use flash for speed
    const model = "gemini-2.5-flash"; 
    
    const prompt = `
      You are a professional UX copywriter helping a freelancer explain their work to a client.
      Rewrite the following rough notes into a concise, confident, and professional explanation.
      The tone should be friendly but expert. Keep it under 50 words.
      
      Rough notes: "${roughText}"
    `;

    const response = await ai.models.generateContent({
      model: model,
      contents: prompt,
    });

    return response.text?.trim() || roughText;
  } catch (error) {
    console.error("Gemini Error:", error);
    return roughText;
  }
};

export const scanWebsiteStructure = async (url: string): Promise<string[]> => {
  if (!process.env.API_KEY) {
    // Fallback if no API key
    return ['Home', 'About', 'Services', 'Contact', 'Blog'];
  }

  try {
    const ai = getClient();
    const model = "gemini-2.5-flash";

    const prompt = `
      Analyze the website URL: "${url}".
      Based on the domain name and typical website patterns for this type of site, list 4 to 6 likely page names that would exist on this site.
      Return ONLY a raw JSON array of strings. Do not add markdown code blocks.
      Example output: ["Home", "Shop", "Cart", "Contact Us"]
    `;

    const response = await ai.models.generateContent({
      model: model,
      contents: prompt,
    });

    const text = response.text?.trim();
    if (!text) throw new Error("No response");

    // Clean up potential markdown formatting if Gemini adds it despite instructions
    const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleanJson);
  } catch (error) {
    console.error("Gemini Scan Error:", error);
    return ['Home', 'About Us', 'Services', 'Contact', 'Pricing'];
  }
};

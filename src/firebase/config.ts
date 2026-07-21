const isValidValue = (val: string | undefined, expectedPrefix?: string): boolean => {
  if (!val) return false;
  const trimmed = val.trim();
  if (trimmed === "" || trimmed === "undefined" || trimmed === "null") return false;
  if (trimmed.includes("NEXT_PUBLIC_") || trimmed.includes("=") || trimmed.includes("api.mondomaine.com")) {
    return false;
  }
  if (expectedPrefix && !trimmed.startsWith(expectedPrefix)) {
    return false;
  }
  return true;
};

const getFirebaseConfig = () => {
  const defaultProjectId = "studio-5762227208-59ca7";
  const defaultAppId = "1:581334909929:web:48f97c487c1043b2370178";
  const defaultApiKey = "AIzaSyCDX7bDK8Az5aFdr6YMFY2f1-I5h6eIWZQ";
  const defaultAuthDomain = "studio-5762227208-59ca7.firebaseapp.com";
  const defaultMessagingSenderId = "581334909929";

  const envProjectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const envAppId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;
  const envApiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const envAuthDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
  const envMessagingSenderId = process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID;

  return {
    projectId: isValidValue(envProjectId) ? envProjectId!.trim() : defaultProjectId,
    appId: isValidValue(envAppId, "1:") ? envAppId!.trim() : defaultAppId,
    apiKey: isValidValue(envApiKey, "AIzaSy") ? envApiKey!.trim() : defaultApiKey,
    authDomain: isValidValue(envAuthDomain) ? envAuthDomain!.trim() : defaultAuthDomain,
    measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || "",
    messagingSenderId: isValidValue(envMessagingSenderId) ? envMessagingSenderId!.trim() : defaultMessagingSenderId,
  };
};

export const firebaseConfig = getFirebaseConfig();


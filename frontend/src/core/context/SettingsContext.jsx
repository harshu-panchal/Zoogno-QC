import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo
} from "react";
import axiosInstance from "@core/api/axios";
import { getWithDedupe } from "@core/api/dedupe";
import { DEFAULT_SETTINGS, applyThemeVariables } from "./SettingsDefaults";

const SETTINGS_STORAGE_KEY = "zoogno_app_settings";

const getInitialSettings = () => {
  try {
    const cached = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (cached) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(cached) };
    }
  } catch (e) {
    // Ignore parse error
  }
  return DEFAULT_SETTINGS;
};

// Create context with null so we can check if it's provided
const SettingsContext = createContext(null);

export const SettingsProvider = ({ children }) => {
  const [settings, setSettings] = useState(getInitialSettings);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchSettings = useCallback(async (options = {}) => {
    try {
      setLoading(true);
      setError(null);
      // Use deduplicated fetch for app settings
      const res = await getWithDedupe("/settings", {}, { 
        ttl: 60 * 1000,
        forceRefresh: options.forceRefresh || false 
      });
      const data = res.data?.result || res.data;
      const merged = { ...DEFAULT_SETTINGS, ...data };
      setSettings(merged);
      applyThemeVariables(merged);
      try {
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(merged));
      } catch (e) {}
    } catch (err) {
      console.error("Failed to fetch settings", err);
      setError(
        err?.response?.data?.message ||
          err.message ||
          "Failed to load settings",
      );
      setSettings((prev) => prev || DEFAULT_SETTINGS);
      applyThemeVariables(DEFAULT_SETTINGS);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // Sync settings across open browser tabs in real-time
  useEffect(() => {
    const handleStorageChange = (e) => {
      if (e.key === SETTINGS_STORAGE_KEY && e.newValue) {
        try {
          const updated = JSON.parse(e.newValue);
          const merged = { ...DEFAULT_SETTINGS, ...updated };
          setSettings(merged);
          applyThemeVariables(merged);
        } catch (err) {}
      }
    };
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  // UseMemo to avoid rerenders of children if values haven't changed
  const value = useMemo(() => ({
    settings,
    loading,
    error,
    refetch: fetchSettings,
  }), [settings, loading, error, fetchSettings]);

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error("useSettings must be used within a SettingsProvider");
  }
  return context;
};

export default SettingsContext;

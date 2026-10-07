"use client";

// Turns cloud sync of the app's settings (lib/cloudSync.ts) on for the signed-in user
import { useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { setCloudSyncUser } from "../lib/cloudSync";

export default function CloudSync() {
  const { user } = useAuth();
  useEffect(() => { setCloudSyncUser(user?.uid ?? null); }, [user?.uid]);
  return null;
}

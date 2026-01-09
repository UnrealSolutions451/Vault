import { supabase } from "./supabase.js";

export async function requireAuth() {
  const { data } = await supabase.auth.getSession();

  if (!data.session) {
    window.location.href = "login.html";
    return;
  }

  // Refresh profile if needed
  let profile = JSON.parse(localStorage.getItem("profile"));

  if (!profile) {
    const userId = data.session.user.id;

    const { data: freshProfile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();

    if (!freshProfile) {
      alert("Profile missing.");
      return;
    }

    localStorage.setItem("profile", JSON.stringify(freshProfile));
  }
}

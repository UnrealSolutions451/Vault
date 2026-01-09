import { supabase } from "./supabase.js";

window.login = async function () {

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value.trim();
  const errorBox = document.getElementById("error");

  errorBox.innerText = "";

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    errorBox.innerText = error.message;
    return;
  }

  // Fetch profile
  const userId = data.user.id;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();

  if (profileError) {
    errorBox.innerText = "Profile not found.";
    return;
  }

  // Save session locally
  localStorage.setItem("profile", JSON.stringify(profile));

  // Redirect
  window.location.href = "index.html";
};

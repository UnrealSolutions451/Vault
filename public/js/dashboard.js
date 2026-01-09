import { supabase } from "./supabase.js";
import { requireAuth } from "./auth.js";
await requireAuth();

async function loadDashboard() {

  const today = new Date().toISOString().split("T")[0];

  const { data: sales } = await supabase
    .from("sales")
    .select("total")
    .gte("created_at", today);

  const totalSales = sales?.reduce((sum, s) => sum + Number(s.total), 0) || 0;

  const { count: inventoryCount } = await supabase
    .from("inventory")
    .select("*", { count: "exact", head: true });

  const { count: activeStaff } = await supabase
    .from("staff")
    .select("*", { count: "exact", head: true })
    .eq("active", true);

  document.getElementById("todaySales").innerHTML = `💰 Today Sales: ₹${totalSales}`;
  document.getElementById("inventoryCount").innerHTML = `📦 Inventory Items: ${inventoryCount}`;
  document.getElementById("activeStaff").innerHTML = `👨‍💼 Active Staff: ${activeStaff}`;
}

loadDashboard();

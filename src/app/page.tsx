import { redirect } from "next/navigation";

// The public landing page arrives in phase 13; until then / opens the app.
export default function Root() {
  redirect("/accueil");
}

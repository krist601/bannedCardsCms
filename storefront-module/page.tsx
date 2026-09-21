import { redirect } from "next/navigation";
export default function CmsEntry() {
  redirect(process.env.CMS_URL || "http://localhost:3001");
}

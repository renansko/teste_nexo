import { listConversations } from "@/services/conversations";
export const runtime = "nodejs";
export const GET = () => Response.json(listConversations());

import { visibleFilterSets } from "../../../../lib/cms-visible-sets";
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import {
  groupSets,
  latestSetCodes,
  pageGroups,
} from "../../../../lib/set-directory";
import { readMagicSets } from "../../../../lib/set-directory-store";
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const limit = req.query.limit === undefined ? 2 : Number(req.query.limit);
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 10 ||
    (req.query.cursor !== undefined && typeof req.query.cursor !== "string") ||
    (req.query.q !== undefined && typeof req.query.q !== "string")
  ) {
    res
      .status(400)
      .json({ message: "Use limit 1–10 and string cursor/q parameters" });
    return;
  }
  const directory = await readMagicSets(req.scope);
  if (!directory.length) {
    res.status(503).json({
      message: "The set directory is being prepared. Please try again shortly.",
    });
    return;
  }
  const sets = visibleFilterSets(directory);
  try {
    const page = pageGroups(groupSets(sets), {
      limit,
      cursor: req.query.cursor as string | undefined,
      query: req.query.q as string | undefined,
    });
    res.json({ ...page, latestSetCodes: latestSetCodes(sets) });
  } catch (error) {
    res.status(400).json({
      message: error instanceof Error ? error.message : "Invalid cursor",
    });
  }
}

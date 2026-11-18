import { db } from "./db";
import { writeAuditLog } from "./audit-service";

export const FEATURE_MIN_STAGE = { wishlist: 2, stockNotification: 2 } as const;
export type RolloutFeature = keyof typeof FEATURE_MIN_STAGE;

export function featureEnabledForBranch(
  feature: RolloutFeature,
  branch: { rolloutStage: number },
) {
  if (process.env.ROLLOUT_GATING === "off") return true;
  return branch.rolloutStage >= FEATURE_MIN_STAGE[feature];
}

export async function reminderEnabled() {
  if (process.env.ROLLOUT_GATING === "off") return true;
  const highest = await db.branch.aggregate({ _max: { rolloutStage: true } });
  return (highest._max.rolloutStage ?? 0) >= 3;
}

export async function setBranchRolloutStageRecord({
  branchId,
  rolloutStage,
  userId,
  userRole,
}: {
  branchId: string;
  rolloutStage: number;
  userId: string;
  userRole: string;
}) {
  if (userRole !== "OWNER") throw new Error("Forbidden.");
  if (!Number.isInteger(rolloutStage) || rolloutStage < 1 || rolloutStage > 3) {
    throw new Error("Rollout stage must be an integer from 1 to 3.");
  }
  return db.$transaction(async (tx) => {
    const branch = await tx.branch.findUnique({ where: { id: branchId }, select: { id: true } });
    if (!branch) return null;
    await tx.branch.update({ where: { id: branchId }, data: { rolloutStage } });
    await writeAuditLog(tx, {
      userId,
      action: "BRANCH_ROLLOUT_STAGE_UPDATED",
      entity: "BRANCH",
      entityId: branchId,
      branchId,
      summary: `Tahap roll-out cabang diubah ke tahap ${rolloutStage}.`,
    });
    return branch;
  });
}

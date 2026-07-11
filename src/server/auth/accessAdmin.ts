import type { Env } from "../env";
import { getConfig } from "../lib/config";

interface AccessPolicyResponse {
  success: boolean;
  result?: {
    include?: AccessRule[];
  };
  errors?: { message: string }[];
}

interface AccessRule {
  email?: { email: string };
  email_domain?: { domain: string };
  [key: string]: unknown;
}

function policyEmail(rule: AccessRule): string | null {
  return rule.email?.email?.trim().toLowerCase() ?? null;
}

function hasEmailInRules(rules: AccessRule[] | undefined, email: string): boolean {
  const normalized = email.trim().toLowerCase();
  return (rules ?? []).some((rule) => policyEmail(rule) === normalized);
}

export async function addEmailToAccessPolicy(
  env: Env,
  email: string,
): Promise<void> {
  const config = getConfig(env);
  const token = env.CLOUDFLARE_API_TOKEN;
  const accountId = config.accessAccountId;
  const policyId = config.accessPolicyId;

  if (!token || !accountId || !policyId) {
    console.warn(
      "[invite] Skipping Access allowlist update — CLOUDFLARE_API_TOKEN, ACCESS_ACCOUNT_ID, or ACCESS_POLICY_ID not configured.",
    );
    return;
  }

  const normalized = email.trim().toLowerCase();
  const baseUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/access/policies/${policyId}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  const currentRes = await fetch(baseUrl, { headers });
  const current = (await currentRes.json()) as AccessPolicyResponse;
  if (!currentRes.ok || !current.success || !current.result) {
    const message =
      current.errors?.map((e) => e.message).join("; ") ||
      `Failed to load Access policy (${currentRes.status}).`;
    throw new Error(message);
  }

  if (hasEmailInRules(current.result.include, normalized)) {
    return;
  }

  const include = [
    ...(current.result.include ?? []),
    { email: { email: normalized } },
  ];

  const updateRes = await fetch(baseUrl, {
    method: "PUT",
    headers,
    body: JSON.stringify({ ...current.result, include }),
  });
  const updated = (await updateRes.json()) as AccessPolicyResponse;
  if (!updateRes.ok || !updated.success) {
    const message =
      updated.errors?.map((e) => e.message).join("; ") ||
      `Failed to update Access policy (${updateRes.status}).`;
    throw new Error(message);
  }
}

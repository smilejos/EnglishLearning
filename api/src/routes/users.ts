// 使用者管理路由（全部限 admin）。列出／改角色／預先指派。
import type { FastifyInstance } from "fastify";
import {
  listUsers,
  setUserRole,
  preprovisionUser,
  SetUserRoleRequestSchema,
  PreprovisionUserRequestSchema,
  type DbPool,
  type User,
} from "@el/shared";
import { requireAdmin } from "../auth";

export function registerUserRoutes(
  app: FastifyInstance,
  pool: DbPool,
  adminEmails: string[],
): void {
  const isEnvAdmin = (email: string) =>
    adminEmails.includes(email.toLowerCase());

  const toDto = (u: User) => ({
    id: u.id,
    email: u.email,
    role: isEnvAdmin(u.email) ? "admin" : u.role,
    lastSeenAt: u.lastSeenAt,
    isEnvAdmin: isEnvAdmin(u.email),
  });

  app.get("/users", { preHandler: requireAdmin }, async () => {
    const users = await listUsers(pool);
    return { users: users.map(toDto) };
  });

  app.put(
    "/users/:email/role",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const email = decodeURIComponent(
        (request.params as { email: string }).email,
      );
      if (isEnvAdmin(email)) {
        return reply
          .code(400)
          .send({ error: "管理者身分由 ADMIN_EMAILS 決定，無法於後台變更" });
      }
      const parsed = SetUserRoleRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid body" });
      }
      const user = await setUserRole(pool, email, parsed.data.role);
      if (!user) return reply.code(404).send({ error: "user not found" });
      return { user: toDto(user) };
    },
  );

  app.post("/users", { preHandler: requireAdmin }, async (request, reply) => {
    const parsed = PreprovisionUserRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid body" });
    }
    if (isEnvAdmin(parsed.data.email)) {
      return reply
        .code(400)
        .send({ error: "此 email 已是 env 管理者，無需指派" });
    }
    const user = await preprovisionUser(
      pool,
      parsed.data.email,
      parsed.data.role,
    );
    return { user: toDto(user) };
  });
}

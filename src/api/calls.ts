import { createServerFn } from "@tanstack/react-start";
import { prisma } from "../db";

export const getActiveCall = createServerFn().handler(async () => {
  return await prisma.call.findFirst({
    where: { active: true },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
    },
  });
});

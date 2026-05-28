import { describe, expect, it } from "vitest";
import { mergeUsers } from "./users";

describe("mergeUsers", () => {
  it("merges auth users with profiles by id", () => {
    const authUsers = [
      { id: "u1", email: "admin@school.ac.th", created_at: "2026-01-01T00:00:00Z" },
    ];
    const profiles = [
      { id: "u1", role: "admin", display_name: "นางสาวสมใจ", is_active: true },
    ];
    const result = mergeUsers(authUsers, profiles);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "u1",
      email: "admin@school.ac.th",
      displayName: "นางสาวสมใจ",
      role: "admin",
      isActive: true,
      createdAt: "2026-01-01T00:00:00Z",
    });
  });

  it("excludes auth users with no matching profile", () => {
    const authUsers = [
      { id: "u1", email: "ghost@school.ac.th", created_at: "2026-01-01T00:00:00Z" },
    ];
    const profiles: { id: string; role: string; display_name: string; is_active: boolean }[] = [];
    const result = mergeUsers(authUsers, profiles);
    expect(result).toHaveLength(0);
  });

  it("falls back to empty string when email or display_name is missing", () => {
    const authUsers = [{ id: "u1", email: undefined as unknown as string, created_at: "2026-01-01T00:00:00Z" }];
    const profiles = [{ id: "u1", role: "teacher", display_name: "", is_active: false }];
    const result = mergeUsers(authUsers, profiles);
    expect(result[0].email).toBe("");
    expect(result[0].displayName).toBe("");
    expect(result[0].isActive).toBe(false);
  });

  it("handles multiple users and preserves order", () => {
    const authUsers = [
      { id: "u1", email: "a@s.th", created_at: "2026-01-01T00:00:00Z" },
      { id: "u2", email: "b@s.th", created_at: "2026-01-02T00:00:00Z" },
    ];
    const profiles = [
      { id: "u1", role: "admin", display_name: "A", is_active: true },
      { id: "u2", role: "finance", display_name: "B", is_active: true },
    ];
    const result = mergeUsers(authUsers, profiles);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("u1");
    expect(result[1].role).toBe("finance");
  });
});

export function visibleApplicationWhere(user: { id: string; permissions: string[] }): Record<string, unknown> {
  return user.permissions.includes('pm.manage') ? {} : { OR: [{ managerId: user.id }, { processorId: user.id }] }
}

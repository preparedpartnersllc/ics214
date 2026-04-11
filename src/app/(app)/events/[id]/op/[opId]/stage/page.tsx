import { redirect } from 'next/navigation'

export default async function StagePageRedirect({
  params,
}: {
  params: Promise<{ id: string; opId: string }>
}) {
  const { id, opId } = await params
  redirect(`/events/${id}/op/${opId}/staff`)
}

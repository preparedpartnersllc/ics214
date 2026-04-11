import { redirect } from 'next/navigation'

export default async function BuildPageRedirect({
  params,
}: {
  params: Promise<{ id: string; opId: string }>
}) {
  const { id, opId } = await params
  redirect(`/events/${id}/op/${opId}/stage`)
}

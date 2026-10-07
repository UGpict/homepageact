import { notFound } from "next/navigation"
import { JobPreview } from "../../../components/JobPreview"
import { appContext, getJob } from "../../../lib/server"

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const app = appContext()
  const job = getJob(app, id)
  if (!job) notFound()
  const requesterLabel = job.requestedBy === app.user.id ? app.user.displayName : job.requestedBy
  return <JobPreview job={job} requesterLabel={requesterLabel} />
}

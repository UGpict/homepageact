import { AchievementForm } from "../../../components/AchievementForm"
import { formOptions } from "../../../lib/server"

export default function NewAchievementPage() {
  return <AchievementForm options={formOptions()} />
}

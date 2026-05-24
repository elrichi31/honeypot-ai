import type {
  DiversifiedAttackerStat,
  SprayPasswordStat,
  TargetedUsernameStat,
} from "@/lib/api"

export interface FilteredPatterns {
  sprays: SprayPasswordStat[]
  targets: TargetedUsernameStat[]
  attackers: DiversifiedAttackerStat[]
}

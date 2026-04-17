export interface TimezoneGroup {
  label: string
  zones: { value: string; label: string }[]
}

export const TIMEZONE_GROUPS: TimezoneGroup[] = [
  {
    label: "América",
    zones: [
      { value: "America/New_York",                label: "New York (UTC−5/−4)" },
      { value: "America/Chicago",                 label: "Chicago (UTC−6/−5)" },
      { value: "America/Denver",                  label: "Denver (UTC−7/−6)" },
      { value: "America/Los_Angeles",             label: "Los Ángeles (UTC−8/−7)" },
      { value: "America/Bogota",                  label: "Bogotá (UTC−5)" },
      { value: "America/Lima",                    label: "Lima (UTC−5)" },
      { value: "America/Guayaquil",               label: "Guayaquil (UTC−5)" },
      { value: "America/Caracas",                 label: "Caracas (UTC−4)" },
      { value: "America/La_Paz",                  label: "La Paz (UTC−4)" },
      { value: "America/Santiago",                label: "Santiago (UTC−4/−3)" },
      { value: "America/Argentina/Buenos_Aires",  label: "Buenos Aires (UTC−3)" },
      { value: "America/Sao_Paulo",               label: "São Paulo (UTC−3/−2)" },
      { value: "America/Mexico_City",             label: "Ciudad de México (UTC−6/−5)" },
      { value: "America/Havana",                  label: "La Habana (UTC−5/−4)" },
      { value: "America/Santo_Domingo",           label: "Santo Domingo (UTC−4)" },
      { value: "America/Anchorage",               label: "Anchorage (UTC−9/−8)" },
      { value: "Pacific/Honolulu",                label: "Honolulú (UTC−10)" },
    ],
  },
  {
    label: "Europa",
    zones: [
      { value: "UTC",             label: "UTC" },
      { value: "Europe/London",   label: "Londres (UTC+0/+1)" },
      { value: "Europe/Madrid",   label: "Madrid (UTC+1/+2)" },
      { value: "Europe/Paris",    label: "París (UTC+1/+2)" },
      { value: "Europe/Berlin",   label: "Berlín (UTC+1/+2)" },
      { value: "Europe/Rome",     label: "Roma (UTC+1/+2)" },
      { value: "Europe/Amsterdam",label: "Ámsterdam (UTC+1/+2)" },
      { value: "Europe/Moscow",   label: "Moscú (UTC+3)" },
    ],
  },
  {
    label: "Asia / Pacífico",
    zones: [
      { value: "Asia/Dubai",      label: "Dubái (UTC+4)" },
      { value: "Asia/Kolkata",    label: "India (UTC+5:30)" },
      { value: "Asia/Bangkok",    label: "Bangkok (UTC+7)" },
      { value: "Asia/Singapore",  label: "Singapur (UTC+8)" },
      { value: "Asia/Shanghai",   label: "Shanghái (UTC+8)" },
      { value: "Asia/Tokyo",      label: "Tokio (UTC+9)" },
      { value: "Australia/Sydney",label: "Sídney (UTC+10/+11)" },
    ],
  },
  {
    label: "África",
    zones: [
      { value: "Africa/Cairo",        label: "El Cairo (UTC+2/+3)" },
      { value: "Africa/Johannesburg", label: "Johannesburgo (UTC+2)" },
      { value: "Africa/Lagos",        label: "Lagos (UTC+1)" },
    ],
  },
]

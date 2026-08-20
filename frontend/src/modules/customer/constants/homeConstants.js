// Swapped from @mui/icons-material to lucide-react — MUI (+ its @emotion
// runtime) was only reached by customers through this file and a couple of
// others, forcing a second full icon/component library onto the landing
// page even though lucide-react already covers icons in 60+ other customer
// files. Keys below are unchanged, so anything looking up ICON_COMPONENTS
// by category slug is unaffected — only the rendered icon's library changes.
import {
  Laptop as DevicesIcon,
  Home as HomeIcon,
  Shirt as CheckroomIcon,
  Coffee as LocalCafeIcon,
  Dumbbell as SportsSoccerIcon,
  BookOpen as MenuBookIcon,
  Flower2 as SpaIcon,
  Blocks as ToysIcon,
  Car as DirectionsCarIcon,
  PawPrint as PetsIcon,
  Stethoscope as LocalHospitalIcon,
  Sprout as YardIcon,
  Briefcase as BusinessCenterIcon,
  Music as MusicNoteIcon,
  Gem as DiamondIcon,
  Baby as ChildCareIcon,
  Wrench as BuildIcon,
  Luggage as LuggageIcon,
  Palette as ColorLensIcon,
  ShoppingBasket as LocalGroceryStoreIcon,
} from "lucide-react";

export const MARQUEE_MESSAGES = [
  "24/7 Delivery",
  "Minimum Order ₹99",
  "Save Big on Essentials!",
];

export const ICON_COMPONENTS = {
  electronics: DevicesIcon,
  fashion: CheckroomIcon,
  home: HomeIcon,
  food: LocalCafeIcon,
  sports: SportsSoccerIcon,
  books: MenuBookIcon,
  beauty: SpaIcon,
  toys: ToysIcon,
  automotive: DirectionsCarIcon,
  pets: PetsIcon,
  health: LocalHospitalIcon,
  garden: YardIcon,
  office: BusinessCenterIcon,
  music: MusicNoteIcon,
  jewelry: DiamondIcon,
  baby: ChildCareIcon,
  tools: BuildIcon,
  luggage: LuggageIcon,
  art: ColorLensIcon,
  grocery: LocalGroceryStoreIcon,
};

export const QUICK_CATEGORY_PALETTES = [
  {
    bgFrom: "#ffd96a",
    bgVia: "#ffeaa0",
    bgTo: "#fff0c7",
    glowColor: "rgba(255,184,0,0.18)",
    frameColor: "#f0d98a",
  },
  {
    bgFrom: "var(--primary)",
    bgVia: "#cffafe",
    bgTo: "#ecfeff",
    glowColor: "rgba(97,218,251,0.18)",
    frameColor: "#a5f3fc",
  },
  {
    bgFrom: "#f3a25d",
    bgVia: "#f9c48b",
    bgTo: "#fee0bf",
    glowColor: "rgba(255,139,61,0.16)",
    frameColor: "#efc08e",
  },
  {
    bgFrom: "#b8eff0",
    bgVia: "#d5f7f5",
    bgTo: "#edfdfc",
    glowColor: "rgba(122,215,215,0.16)",
    frameColor: "#b9e5e3",
  },
];

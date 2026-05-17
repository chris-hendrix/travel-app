/** Category keys for POI suggestions, matching the Discover tab */
export type POICategoryKey =
  | "food_and_drink"
  | "arts_and_entertainment"
  | "outdoors"
  | "nightlife";

/** A single POI suggestion stored in the poi_cache JSONB blob */
export interface POISuggestion {
  sourceId: string;           // fsq_place_id from Foursquare (or other vendor's place ID)
  name: string;
  address: string | null;     // location.formatted_address
  lat: number;
  lon: number;
  distance: number;           // meters from search center
  category: POICategoryKey;
  popularity: number | null;  // Premium-tier field (0-1), null in freePro
  price: number | null;       // Premium-tier field (1-4), null in freePro
  rating: number | null;      // Premium-tier field (0-10), null in freePro
  website: string | null;     // Foursquare Pro: website
  tel: string | null;         // Foursquare Pro: tel (local format)
  subcategory: string | null; // categories[0].name (e.g. "Italian Restaurant")
  eventId: string | null;     // FK to events.id when converted to a trip event
}

/** Response from GET /api/trips/:id/discover */
export interface POISuggestionsResponse {
  destination: string | null;
  source: string;
  categories: Record<POICategoryKey, POISuggestion[]>;
  partial?: boolean;
  errors?: Record<string, string>;
}

/** A single Foursquare category with its ID and human-readable name */
export interface FsqCategory {
  fsqCategoryId: string;
  name: string;
}

/** Category configuration with Foursquare parent + subcategory IDs */
export interface POICategoryConfig {
  id: POICategoryKey;
  label: string;
  parent: FsqCategory;
  subcategories: FsqCategory[];
}

export const POI_CATEGORIES: POICategoryConfig[] = [
  {
    id: "food_and_drink",
    label: "Food & Drink",
    parent: { fsqCategoryId: "4d4b7105d754a06374d81259", name: "Food" },
    subcategories: [
      { fsqCategoryId: "4bf58dd8d48988d107941735", name: "Argentinian Restaurant" },
      { fsqCategoryId: "4bf58dd8d48988d108941735", name: "Dumpling Restaurant" },
      { fsqCategoryId: "4bf58dd8d48988d10c941735", name: "French Restaurant" },
      { fsqCategoryId: "4bf58dd8d48988d10d941735", name: "German Restaurant" },
      { fsqCategoryId: "4bf58dd8d48988d10e941735", name: "Greek Restaurant" },
      { fsqCategoryId: "4bf58dd8d48988d10f941735", name: "Indian Restaurant" },
      { fsqCategoryId: "4bf58dd8d48988d110941735", name: "Italian Restaurant" },
      { fsqCategoryId: "4bf58dd8d48988d111941735", name: "Japanese Restaurant" },
      { fsqCategoryId: "4bf58dd8d48988d112941735", name: "Juice Bar" },
      { fsqCategoryId: "4bf58dd8d48988d113941735", name: "Korean Restaurant" },
      { fsqCategoryId: "4bf58dd8d48988d115941735", name: "Middle Eastern Restaurant" },
      { fsqCategoryId: "4bf58dd8d48988d142941735", name: "Asian Restaurant" },
      { fsqCategoryId: "4bf58dd8d48988d143941735", name: "Breakfast Spot" },
      { fsqCategoryId: "4bf58dd8d48988d145941735", name: "Chinese Restaurant" },
      { fsqCategoryId: "4bf58dd8d48988d146941735", name: "Deli" },
      { fsqCategoryId: "4bf58dd8d48988d147941735", name: "Diner" },
      { fsqCategoryId: "4bf58dd8d48988d149941735", name: "Thai Restaurant" },
      { fsqCategoryId: "4bf58dd8d48988d14a941735", name: "Vietnamese Restaurant" },
      { fsqCategoryId: "4bf58dd8d48988d14c941735", name: "Wings Joint" },
      { fsqCategoryId: "4bf58dd8d48988d14e941735", name: "American Restaurant" },
      { fsqCategoryId: "4bf58dd8d48988d14f941735", name: "Southern Food Restaurant" },
      { fsqCategoryId: "4bf58dd8d48988d150941735", name: "Spanish Restaurant" },
      { fsqCategoryId: "4bf58dd8d48988d151941735", name: "Taco Restaurant" },
      { fsqCategoryId: "4bf58dd8d48988d154941735", name: "Cuban Restaurant" },
      { fsqCategoryId: "4bf58dd8d48988d155941735", name: "Gastropub" },
      { fsqCategoryId: "4bf58dd8d48988d157941735", name: "New American Restaurant" },
      { fsqCategoryId: "4bf58dd8d48988d16a941735", name: "Bakery" },
      { fsqCategoryId: "4bf58dd8d48988d16b941735", name: "Brazilian Restaurant" },
      { fsqCategoryId: "4bf58dd8d48988d16c941735", name: "Burger Joint" },
      { fsqCategoryId: "4bf58dd8d48988d16d941735", name: "Café" },
      { fsqCategoryId: "4bf58dd8d48988d16e941735", name: "Fast Food Restaurant" },
      { fsqCategoryId: "4bf58dd8d48988d16f941735", name: "Hot Dog Joint" },
      { fsqCategoryId: "4bf58dd8d48988d1bd941735", name: "Salad Restaurant" },
      { fsqCategoryId: "4bf58dd8d48988d1be941735", name: "Latin American Restaurant" },
      { fsqCategoryId: "4bf58dd8d48988d1c0941735", name: "Mediterranean Restaurant" },
      { fsqCategoryId: "4bf58dd8d48988d1c1941735", name: "Mexican Restaurant" },
      { fsqCategoryId: "4bf58dd8d48988d1c5941735", name: "Sandwich Spot" },
      { fsqCategoryId: "4bf58dd8d48988d1c9941735", name: "Ice Cream Parlor" },
      { fsqCategoryId: "4bf58dd8d48988d1ca941735", name: "Pizzeria" },
      { fsqCategoryId: "4bf58dd8d48988d1cc941735", name: "Steakhouse" },
      { fsqCategoryId: "4bf58dd8d48988d1ce941735", name: "Seafood Restaurant" },
      { fsqCategoryId: "4bf58dd8d48988d1d0941735", name: "Dessert Shop" },
      { fsqCategoryId: "4bf58dd8d48988d1d1941735", name: "Noodle Restaurant" },
      { fsqCategoryId: "4bf58dd8d48988d1d2941735", name: "Sushi Restaurant" },
      { fsqCategoryId: "4bf58dd8d48988d1d3941735", name: "Vegan and Vegetarian Restaurant" },
      { fsqCategoryId: "4bf58dd8d48988d1dc931735", name: "Tea Room" },
      { fsqCategoryId: "4bf58dd8d48988d1df931735", name: "BBQ Joint" },
      { fsqCategoryId: "4bf58dd8d48988d1e0931735", name: "Coffee Shop" },
      { fsqCategoryId: "4bf58dd8d48988d1f5931735", name: "Dim Sum Restaurant" },
      { fsqCategoryId: "4d4ae6fc7a7b7dea34424761", name: "Fried Chicken Joint" },
      { fsqCategoryId: "4eb1bfa43b7b52c0e1adc2e8", name: "Peruvian Restaurant" },
      { fsqCategoryId: "5283c7b4e4b094cb91ec88d7", name: "Kebab Restaurant" },
      { fsqCategoryId: "52af3a7c3cf9994f4e043bed", name: "Cantonese Restaurant" },
      { fsqCategoryId: "52e81612bcbc57f1066b79f3", name: "Souvlaki Shop" },
      { fsqCategoryId: "52e81612bcbc57f1066b79f4", name: "Buffet" },
      { fsqCategoryId: "52e81612bcbc57f1066b79f8", name: "Pakistani Restaurant" },
      { fsqCategoryId: "52e81612bcbc57f1066b79fd", name: "Jewish Restaurant" },
      { fsqCategoryId: "52e81612bcbc57f1066b79ff", name: "Halal Restaurant" },
      { fsqCategoryId: "52e81612bcbc57f1066b7a00", name: "Comfort Food Restaurant" },
      { fsqCategoryId: "53d6c1b0e4b02351e88a83da", name: "Meze Restaurant" },
      { fsqCategoryId: "55a59bace4b013909087cb24", name: "Ramen Restaurant" },
      { fsqCategoryId: "56aa371ae4b08b9a8d5734ba", name: "Tex-Mex Restaurant" },
    ],
  },
  {
    id: "arts_and_entertainment",
    label: "Arts & Entertainment",
    parent: { fsqCategoryId: "4d4b7104d754a06370d81259", name: "Arts and Entertainment" },
    subcategories: [
      { fsqCategoryId: "4bf58dd8d48988d135941735", name: "Indie Theater" },
      { fsqCategoryId: "4bf58dd8d48988d136941735", name: "Opera House" },
      { fsqCategoryId: "4bf58dd8d48988d137941735", name: "Theater" },
      { fsqCategoryId: "4bf58dd8d48988d171941735", name: "Event Space" },
      { fsqCategoryId: "4bf58dd8d48988d17b941735", name: "Zoo" },
      { fsqCategoryId: "4bf58dd8d48988d17c941735", name: "Casino" },
      { fsqCategoryId: "4bf58dd8d48988d17e941735", name: "Indie Movie Theater" },
      { fsqCategoryId: "4bf58dd8d48988d17f941735", name: "Movie Theater" },
      { fsqCategoryId: "4bf58dd8d48988d181941735", name: "Museum" },
      { fsqCategoryId: "4bf58dd8d48988d182941735", name: "Amusement Park" },
      { fsqCategoryId: "4bf58dd8d48988d18e941735", name: "Comedy Club" },
      { fsqCategoryId: "4bf58dd8d48988d18f941735", name: "Art Museum" },
      { fsqCategoryId: "4bf58dd8d48988d190941735", name: "History Museum" },
      { fsqCategoryId: "4bf58dd8d48988d191941735", name: "Science Museum" },
      { fsqCategoryId: "4bf58dd8d48988d192941735", name: "Planetarium" },
      { fsqCategoryId: "4bf58dd8d48988d193941735", name: "Water Park" },
      { fsqCategoryId: "4bf58dd8d48988d199941735", name: "College Arts Building" },
      { fsqCategoryId: "4bf58dd8d48988d1ac941735", name: "College Theater" },
      { fsqCategoryId: "4bf58dd8d48988d1af941735", name: "College Auditorium" },
      { fsqCategoryId: "4bf58dd8d48988d1e1931735", name: "Arcade" },
      { fsqCategoryId: "4bf58dd8d48988d1e2931735", name: "Art Gallery" },
      { fsqCategoryId: "4bf58dd8d48988d1e3931735", name: "Pool Hall" },
      { fsqCategoryId: "4bf58dd8d48988d1e5931735", name: "Music Venue" },
      { fsqCategoryId: "4bf58dd8d48988d1e7931735", name: "Jazz and Blues Venue" },
      { fsqCategoryId: "4bf58dd8d48988d1e9931735", name: "Rock Club" },
      { fsqCategoryId: "4bf58dd8d48988d1f2931735", name: "Performing Arts Venue" },
      { fsqCategoryId: "4deefb944765f83613cdba6e", name: "Historic and Protected Site" },
      { fsqCategoryId: "4eb1daf44b900d56c88a4600", name: "Fair" },
      { fsqCategoryId: "4fceea171983d5d06c3e9823", name: "Aquarium" },
      { fsqCategoryId: "5032792091d4c4b30a586d5c", name: "Concert Hall" },
      { fsqCategoryId: "507c8c4091d498d9fc8c67a9", name: "Public Art" },
      { fsqCategoryId: "5109983191d435c0d71c2bb1", name: "Attraction" },
      { fsqCategoryId: "52e81612bcbc57f1066b79ed", name: "Outdoor Sculpture" },
      { fsqCategoryId: "52e81612bcbc57f1066b79ef", name: "Country Dance Club" },
      { fsqCategoryId: "56aa371be4b08b9a8d5734db", name: "Amphitheater" },
      { fsqCategoryId: "56aa371be4b08b9a8d5734de", name: "Drive-in Theater" },
      { fsqCategoryId: "56aa371be4b08b9a8d573520", name: "Tour Provider" },
      { fsqCategoryId: "56aa371be4b08b9a8d573532", name: "Exhibit" },
      { fsqCategoryId: "56aa371be4b08b9a8d573554", name: "Entertainment Service" },
      { fsqCategoryId: "58daa1558bbb0b01f18ec1fd", name: "Zoo Exhibit" },
      { fsqCategoryId: "5744ccdfe4b0c0459246b4d9", name: "Observatory" },
    ],
  },
  {
    id: "outdoors",
    label: "Outdoors",
    parent: { fsqCategoryId: "4d4b7105d754a06377d81259", name: "Outdoors and Recreation" },
    subcategories: [
      { fsqCategoryId: "4bf58dd8d48988d15a941735", name: "Garden" },
      { fsqCategoryId: "4bf58dd8d48988d15b941735", name: "Farm" },
      { fsqCategoryId: "4bf58dd8d48988d15d941735", name: "Lighthouse" },
      { fsqCategoryId: "4bf58dd8d48988d15e941735", name: "Swimming Pool" },
      { fsqCategoryId: "4bf58dd8d48988d15f941735", name: "Field" },
      { fsqCategoryId: "4bf58dd8d48988d106941735", name: "Track" },
      { fsqCategoryId: "4bf58dd8d48988d130941735", name: "Structure" },
      { fsqCategoryId: "4bf58dd8d48988d12d941735", name: "Monument" },
      { fsqCategoryId: "4bf58dd8d48988d159941735", name: "Hiking Trail" },
      { fsqCategoryId: "4bf58dd8d48988d161941735", name: "Lake" },
      { fsqCategoryId: "4bf58dd8d48988d162941735", name: "Other Great Outdoors" },
      { fsqCategoryId: "4bf58dd8d48988d163941735", name: "Park" },
      { fsqCategoryId: "4bf58dd8d48988d164941735", name: "Plaza" },
      { fsqCategoryId: "4bf58dd8d48988d165941735", name: "Scenic Lookout" },
      { fsqCategoryId: "4bf58dd8d48988d166941735", name: "Sculpture Garden" },
      { fsqCategoryId: "4bf58dd8d48988d167941735", name: "Skate Park" },
      { fsqCategoryId: "4bf58dd8d48988d1e0941735", name: "Harbor or Marina" },
      { fsqCategoryId: "4bf58dd8d48988d1e1941735", name: "Basketball Court" },
      { fsqCategoryId: "4bf58dd8d48988d1e2941735", name: "Beach" },
      { fsqCategoryId: "4bf58dd8d48988d1e3941735", name: "Surf Spot" },
      { fsqCategoryId: "4bf58dd8d48988d1e4941735", name: "Campground" },
      { fsqCategoryId: "4bf58dd8d48988d1e5941735", name: "Dog Park" },
      { fsqCategoryId: "4bf58dd8d48988d1e6941735", name: "Golf Course" },
      { fsqCategoryId: "4bf58dd8d48988d1e7941735", name: "Playground" },
      { fsqCategoryId: "4bf58dd8d48988d1e8941735", name: "Baseball Field" },
      { fsqCategoryId: "4bf58dd8d48988d1df941735", name: "Bridge" },
      { fsqCategoryId: "4deefb944765f83613cdba6e", name: "Historic and Protected Site" },
      { fsqCategoryId: "4e74f6cabd41c4836eac4c31", name: "Pier" },
      { fsqCategoryId: "503289d391d4c4b30a586d6a", name: "Climbing Gym" },
      { fsqCategoryId: "50328a4b91d4c4b30a586d6b", name: "Rock Climbing Spot" },
      { fsqCategoryId: "4cce455aebf7b749d5e191f5", name: "Soccer Field" },
      { fsqCategoryId: "50aaa4314b90af0d42d5de10", name: "Island" },
      { fsqCategoryId: "50aaa49e4b90af0d42d5de11", name: "Castle" },
      { fsqCategoryId: "52e81612bcbc57f1066b7a13", name: "Nature Preserve" },
      { fsqCategoryId: "52e81612bcbc57f1066b7a21", name: "National Park" },
      { fsqCategoryId: "52e81612bcbc57f1066b7a22", name: "Botanical Garden" },
      { fsqCategoryId: "52e81612bcbc57f1066b7a23", name: "Forest" },
      { fsqCategoryId: "52e81612bcbc57f1066b7a25", name: "Pedestrian Plaza" },
      { fsqCategoryId: "52e81612bcbc57f1066b7a30", name: "Nudist Beach" },
      { fsqCategoryId: "5642206c498e4bfca532186c", name: "Memorial Site" },
      { fsqCategoryId: "56aa371be4b08b9a8d5734c3", name: "Waterfront" },
      { fsqCategoryId: "56aa371be4b08b9a8d573541", name: "Reservoir" },
      { fsqCategoryId: "56aa371be4b08b9a8d573547", name: "Fountain" },
      { fsqCategoryId: "56aa371be4b08b9a8d57355e", name: "Bike Trail" },
      { fsqCategoryId: "56aa371be4b08b9a8d573562", name: "Canal" },
      { fsqCategoryId: "58daa1558bbb0b01f18ec203", name: "Outdoor Gym" },
      { fsqCategoryId: "5bae9231bedf3950379f89cd", name: "Hill" },
      { fsqCategoryId: "5bae9231bedf3950379f89d0", name: "State or Provincial Park" },
      { fsqCategoryId: "5fabfe3599ce226e27fe709a", name: "Picnic Area" },
      { fsqCategoryId: "63be6904847c3692a84b9be0", name: "Natural Park" },
    ],
  },
  {
    id: "nightlife",
    label: "Nightlife",
    parent: { fsqCategoryId: "4d4b7105d754a06376d81259", name: "Nightlife Spot" },
    subcategories: [
      { fsqCategoryId: "4bf58dd8d48988d116941735", name: "Bar" },
      { fsqCategoryId: "4bf58dd8d48988d117941735", name: "Beer Garden" },
      { fsqCategoryId: "4bf58dd8d48988d118941735", name: "Dive Bar" },
      { fsqCategoryId: "4bf58dd8d48988d11b941735", name: "Pub" },
      { fsqCategoryId: "4bf58dd8d48988d11d941735", name: "Cocktail Bar" },
      { fsqCategoryId: "4bf58dd8d48988d11e941735", name: "Sports Bar" },
      { fsqCategoryId: "4bf58dd8d48988d120941735", name: "Karaoke Bar" },
      { fsqCategoryId: "4bf58dd8d48988d121941735", name: "Lounge" },
      { fsqCategoryId: "4bf58dd8d48988d122941735", name: "Nightclub" },
      { fsqCategoryId: "50327c8591d4c4b30a586d5d", name: "Brewery" },
    ],
  },
];

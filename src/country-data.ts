export interface Country {
  iso: string;
  name: string;
  tld: string;
  phone: string;
  aliases: string[];
}

const c = (iso: string, name: string, tld: string, phone: string, aliases: string[] = []): Country => ({
  iso,
  name,
  tld,
  phone,
  aliases,
});

export const COUNTRIES: Country[] = [
  c("EC", "Ecuador", "ec", "593"),
  c("CO", "Colombia", "co", "57"),
  c("CR", "Costa Rica", "cr", "506"),
  c("GT", "Guatemala", "gt", "502"),
  c("PH", "Philippines", "ph", "63", ["Filipinas"]),
  c("DO", "Dominican Republic", "do", "1809", ["República Dominicana", "Republica Dominicana"]),
  c("PE", "Peru", "pe", "51", ["Perú"]),
  c("CM", "Cameroon", "cm", "237", ["Cameroun"]),
  c("CI", "Ivory Coast", "ci", "225", ["Côte d'Ivoire", "Cote d'Ivoire"]),
  c("LT", "Lithuania", "lt", "370", ["Lietuva", "Lietuvos"]),
  c("LV", "Latvia", "lv", "371", ["Latvija"]),
  c("PL", "Poland", "pl", "48", ["Polska"]),
  c("UA", "Ukraine", "ua", "380"),
  c("ES", "Spain", "es", "34", ["España", "Espana"]),
  c("AR", "Argentina", "ar", "54"),
  c("NZ", "New Zealand", "nz", "64"),
  c("MX", "Mexico", "mx", "52", ["México"]),
  c("RO", "Romania", "ro", "40", ["România"]),
  c("HU", "Hungary", "hu", "36", ["Magyarország"]),
  c("DE", "Germany", "de", "49", ["Deutschland"]),
  c("IT", "Italy", "it", "39", ["Italia"]),
  c("GR", "Greece", "gr", "30", ["Ελλάδα", "Hellas"]),
  c("PT", "Portugal", "pt", "351"),
  c("TR", "Turkey", "tr", "90", ["Türkiye", "Turkiye"]),
  c("TN", "Tunisia", "tn", "216", ["Tunisie"]),
  c("MA", "Morocco", "ma", "212", ["Maroc"]),
  c("HR", "Croatia", "hr", "385", ["Hrvatska"]),
  c("FR", "France", "fr", "33"),
  c("NL", "Netherlands", "nl", "31", ["Nederland", "Holland"]),
  c("BE", "Belgium", "be", "32", ["Belgique", "België"]),
  c("GB", "United Kingdom", "uk", "44", ["UK", "England"]),
  c("US", "United States", "us", "1", ["USA", "U.S.A."]),
  c("BR", "Brazil", "br", "55", ["Brasil"]),
  c("IN", "India", "in", "91"),
  c("VN", "Vietnam", "vn", "84", ["Viet Nam"]),
  c("TH", "Thailand", "th", "66"),
  c("CN", "China", "cn", "86"),
  c("EG", "Egypt", "eg", "20"),
  c("ZA", "South Africa", "za", "27"),
  c("KE", "Kenya", "ke", "254"),
  c("AU", "Australia", "au", "61"),
  c("CL", "Chile", "cl", "56"),
  c("PA", "Panama", "pa", "507", ["Panamá"]),
  c("HN", "Honduras", "hn", "504"),
  c("NI", "Nicaragua", "ni", "505"),
  c("AT", "Austria", "at", "43", ["Österreich"]),
  c("CH", "Switzerland", "ch", "41", ["Schweiz", "Suisse"]),
  c("EE", "Estonia", "ee", "372", ["Eesti"]),
  c("BG", "Bulgaria", "bg", "359"),
  c("RS", "Serbia", "rs", "381"),
];

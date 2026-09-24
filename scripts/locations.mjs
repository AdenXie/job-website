import regions from 'china-region-data';

const municipalities = new Set(['北京', '天津', '上海', '重庆']);
const provinceName = (name) => name
  .replace(/特别行政区$/, '')
  .replace(/壮族自治区|回族自治区|维吾尔自治区|自治区|省|市$/, '');
const cityName = (name) => name.replace(/市$/, '');

const provinces = new Map();
const cities = new Map();
for (const province of regions.province) {
  const short = provinceName(province.name);
  provinces.set(province.name, short);
  provinces.set(short, short);
  if (municipalities.has(short)) {
    cities.set(province.name, { city: short, province: short });
    cities.set(short, { city: short, province: short });
  }
  for (const item of regions.city[province.id] || []) {
    if (['市辖区', '县', '省直辖县级行政区划', '自治区直辖县级行政区划'].includes(item.name)) continue;
    const value = { city: cityName(item.name), province: short };
    cities.set(item.name, value);
    cities.set(value.city, value);
  }
}

// Province-administered county-level cities do not appear in every prefecture list.
for (const [name, province] of Object.entries({
  文昌: '海南', 琼海: '海南', 澄迈: '海南', 潜江: '湖北', 天门: '湖北', 胡杨河: '新疆',
  常熟: '江苏', 横琴: '广东', 西双版纳: '云南', 红河: '云南', 伊犁: '新疆', 雄安: '河北',
  中国香港: '香港',
})) {
  const city = name === '中国香港' ? '香港' : name;
  cities.set(name, { city, province });
  cities.set(`${name}市`, { city, province });
}

const cityAliases = [...cities.keys()].sort((a, b) => b.length - a.length);

function regionOf(value) {
  const name = value.trim().replace(/\s+/g, '');
  if (!name) return null;
  if (/全国/.test(name)) return { city: '全国', province: null };
  if (/海外|国外/.test(name)) return { city: '海外', province: null };
  if (cities.has(name)) return cities.get(name);
  if (provinces.has(name)) return { city: provinces.get(name), province: provinces.get(name) };
  const provinceHint = [...provinces.entries()].find(([alias]) => name.startsWith(alias))?.[1];
  const alias = cityAliases.find((candidate) => {
    const match = cities.get(candidate);
    return name.includes(candidate) && (!provinceHint || match.province === provinceHint);
  });
  if (alias) return cities.get(alias);
  if (provinceHint) return { city: provinceHint, province: provinceHint };
  return { city: cityName(name), province: null };
}

export function normalizeLocations(values) {
  const results = [];
  const seen = new Set();
  for (const value of values || []) {
    if (typeof value !== 'string') continue;
    for (const part of value.split(/[,，、/／]/)) {
      const region = regionOf(part);
      if (!region || seen.has(`${region.city}|${region.province}`)) continue;
      seen.add(`${region.city}|${region.province}`);
      results.push(region);
    }
  }
  return {
    cities: [...new Set(results.map((region) => region.city))],
    provinces: [...new Set(results.map((region) => region.province).filter(Boolean))],
    locations: results,
  };
}

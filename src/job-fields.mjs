export function fieldValues(value) {
  const values = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[、,，；;]/) : [];
  return [...new Set(values.map((item) => String(item).trim()).filter(Boolean))];
}

export function hasFieldValue(value, selected) {
  return !selected || fieldValues(value).includes(selected);
}

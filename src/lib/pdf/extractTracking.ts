/**
 * Извлечение трек-номера в формате UPU S10 из текстового слоя PDF.
 *
 * Формат S10 (ГОСТ/UPU): 2 заглавные латинские буквы (тип отправления) +
 * 9 цифр (8 значащих + 1 контрольная) + 2 заглавные буквы (код страны).
 * Пример: "LS018350611RU" — где "RU" это код страны.
 *
 * Текстовый слой бланка pochta.ru может содержать номер дважды (два штрих-кода),
 * в нижнем регистре и с окружающими пробелами/переводами строк. Функции ниже
 * терпимы к этому: нормализуют к верхнему регистру и убирают внутренние пробелы
 * (которые иногда вставляются между группами символов при извлечении текста).
 */

/** Один S10 без учёта окружения: 2 буквы, 9 цифр, 2 буквы. */
const S10_EXACT = /^[A-Z]{2}\d{9}[A-Z]{2}$/;

/**
 * Поиск S10 в произвольном тексте. Разрешаем необязательные пробелы между
 * логическими группами (буквы / цифры / буквы), т.к. извлечённый из PDF текст
 * иногда разрывает номер пробелами. Границы — небуквенно-цифровые символы,
 * чтобы не «приклеить» лишние символы к коду страны или к типу отправления.
 */
const S10_SEARCH = /[A-Za-z]{2}\s*\d{9}\s*[A-Za-z]{2}/g;

/** Удаляет все пробельные символы и приводит к верхнему регистру. */
function normalize(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase();
}

/**
 * Проверяет, что строка целиком является валидным S10
 * (2 заглавные буквы + 9 цифр + 2 заглавные буквы), без нормализации.
 */
export function isValidS10(s: string): boolean {
  return S10_EXACT.test(s);
}

/**
 * Возвращает ПЕРВЫЙ найденный в тексте S10-номер, нормализованный
 * (верхний регистр, без внутренних пробелов), либо null если ничего не найдено.
 */
export function extractTrackingNumber(text: string): string | null {
  for (const match of text.matchAll(S10_SEARCH)) {
    const candidate = normalize(match[0]);
    if (isValidS10(candidate)) {
      return candidate;
    }
  }
  return null;
}

/**
 * Возвращает все УНИКАЛЬНЫЕ S10-номера в порядке появления (нормализованные).
 * Дубликаты (например, два одинаковых штрих-кода на бланке) схлопываются в один.
 */
export function extractAllTracking(text: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const match of text.matchAll(S10_SEARCH)) {
    const candidate = normalize(match[0]);
    if (isValidS10(candidate) && !seen.has(candidate)) {
      seen.add(candidate);
      result.push(candidate);
    }
  }
  return result;
}

/**
 * Контрольная цифра UPU S10 по 8 значащим цифрам.
 * Веса: 8, 6, 4, 2, 3, 5, 9, 7. Сумма произведений по модулю 11,
 * контрольная цифра = 11 - (sum mod 11); при результате 10 → 0, 11 → 5.
 *
 * Принимает как полную нормализованную строку S10, так и иные регистр/пробелы.
 * Возвращает false для невалидного формата.
 */
export function hasValidS10CheckDigit(s: string): boolean {
  const normalized = normalize(s);
  if (!isValidS10(normalized)) {
    return false;
  }
  const digits = normalized.slice(2, 11); // 9 цифр: 8 значащих + контрольная
  const weights = [8, 6, 4, 2, 3, 5, 9, 7];
  let sum = 0;
  for (let i = 0; i < weights.length; i += 1) {
    sum += Number(digits[i]) * weights[i];
  }
  const remainder = sum % 11;
  let check = 11 - remainder;
  if (check === 10) {
    check = 0;
  } else if (check === 11) {
    check = 5;
  }
  return check === Number(digits[8]);
}

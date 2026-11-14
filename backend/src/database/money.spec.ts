import { parseAmountToMinor, formatMinor, assertPositive, MoneyError } from './money';

describe('parseAmountToMinor', () => {
  it('parses whole amounts', () => {
    expect(parseAmountToMinor('20')).toBe(2000n);
    expect(parseAmountToMinor('0')).toBe(0n);
    expect(parseAmountToMinor('1000000')).toBe(100000000n);
  });

  it('parses decimal amounts', () => {
    expect(parseAmountToMinor('20.5')).toBe(2050n);
    expect(parseAmountToMinor('20.50')).toBe(2050n);
    expect(parseAmountToMinor('0.99')).toBe(99n);
    expect(parseAmountToMinor('12345.67')).toBe(1234567n);
  });

  it('trims whitespace', () => {
    expect(parseAmountToMinor('  20  ')).toBe(2000n);
  });

  it('rejects invalid amounts', () => {
    expect(() => parseAmountToMinor('')).toThrow(MoneyError);
    expect(() => parseAmountToMinor('abc')).toThrow(MoneyError);
    expect(() => parseAmountToMinor('-5')).toThrow(MoneyError);
    expect(() => parseAmountToMinor('20.555')).toThrow(MoneyError);
    expect(() => parseAmountToMinor('20,50')).toThrow(MoneyError);
  });
});

describe('formatMinor', () => {
  it('formats minor units to major', () => {
    expect(formatMinor(2000n)).toBe('20.00');
    expect(formatMinor(2050n)).toBe('20.50');
    expect(formatMinor(99n)).toBe('0.99');
    expect(formatMinor(0n)).toBe('0.00');
    expect(formatMinor(-2000n)).toBe('-20.00');
  });
});

describe('assertPositive', () => {
  it('passes for positive amounts', () => {
    expect(() => assertPositive(1n)).not.toThrow();
    expect(() => assertPositive(100n)).not.toThrow();
  });

  it('throws for zero or negative', () => {
    expect(() => assertPositive(0n)).toThrow(MoneyError);
    expect(() => assertPositive(-1n)).toThrow(MoneyError);
  });
});

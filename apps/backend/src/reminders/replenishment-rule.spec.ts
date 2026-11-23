import { expectedDeliveryDate, replenishmentStatus } from './replenishment-rule';

describe('expectedDeliveryDate', () => {
  it('adds whole days to the Approval Reference Date', () => {
    expect(expectedDeliveryDate('2026-03-10', 5)).toBe('2026-03-15');
  });
  it('rounds Replenishment Time fractions up', () => {
    expect(expectedDeliveryDate('2026-03-10', 4.2)).toBe('2026-03-15');
    expect(expectedDeliveryDate('2026-03-10', 4.01)).toBe('2026-03-15');
    expect(expectedDeliveryDate('2026-03-10', 0.5)).toBe('2026-03-11');
  });
  it('crosses month and year ends (2026 is not a leap year)', () => {
    expect(expectedDeliveryDate('2026-02-27', 2)).toBe('2026-03-01');
    expect(expectedDeliveryDate('2025-12-31', 1)).toBe('2026-01-01');
  });
  it('a zero or negative time delivers on the approval date', () => {
    expect(expectedDeliveryDate('2026-03-10', 0)).toBe('2026-03-10');
    expect(expectedDeliveryDate('2026-03-10', -3)).toBe('2026-03-10');
  });
});

describe('replenishmentStatus', () => {
  const approval = { approvalReferenceDate: '2026-03-10', replenishmentTimeDays: 4.2 }; // expected 2026-03-15

  it('is in progress while the Item is at risk and the delivery date has not passed', () => {
    expect(replenishmentStatus({ approval, referenceDate: '2026-03-10', urgencyLevel: 'CRITICAL' })).toEqual({
      inProgress: true,
      expectedDeliveryDate: '2026-03-15',
      overdue: false,
    });
    expect(replenishmentStatus({ approval, referenceDate: '2026-03-12', urgencyLevel: 'ATTENTION' }).inProgress).toBe(true);
  });
  it('still counts on the delivery day itself', () => {
    const status = replenishmentStatus({ approval, referenceDate: '2026-03-15', urgencyLevel: 'CRITICAL' });
    expect(status).toMatchObject({ inProgress: true, overdue: false });
  });
  it('ends, overdue, the day after the delivery date', () => {
    const status = replenishmentStatus({ approval, referenceDate: '2026-03-16', urgencyLevel: 'CRITICAL' });
    expect(status).toEqual({ inProgress: false, expectedDeliveryDate: '2026-03-15', overdue: true });
  });
  it('ends when the Item is Normal, even before the delivery date', () => {
    expect(replenishmentStatus({ approval, referenceDate: '2026-03-12', urgencyLevel: 'NORMAL' })).toEqual({
      inProgress: false,
      expectedDeliveryDate: '2026-03-15',
      overdue: false,
    });
  });
  it('is never in progress without an approval or without a Reference Date', () => {
    expect(replenishmentStatus({ approval: null, referenceDate: '2026-03-12', urgencyLevel: 'CRITICAL' })).toEqual({
      inProgress: false,
      expectedDeliveryDate: null,
      overdue: false,
    });
    expect(replenishmentStatus({ approval, referenceDate: null, urgencyLevel: 'CRITICAL' }).inProgress).toBe(false);
  });
  it('an Item with no Urgency is not in progress', () => {
    expect(replenishmentStatus({ approval, referenceDate: '2026-03-12', urgencyLevel: null }).inProgress).toBe(false);
  });
});

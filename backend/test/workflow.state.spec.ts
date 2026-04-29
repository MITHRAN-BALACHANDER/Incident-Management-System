import { WorkItemStatus } from '../src/common/enums/work-item-status.enum';
import { WorkItemContext } from '../src/workflow/context/work-item.context';
import { BadRequestException } from '@nestjs/common';

describe('WorkItemContext — State Machine Transitions', () => {
  describe('OPEN state', () => {
    it('should transition OPEN → INVESTIGATING', () => {
      const ctx = new WorkItemContext(WorkItemStatus.OPEN);
      const next = ctx.transition(WorkItemStatus.INVESTIGATING);
      expect(next).toBe(WorkItemStatus.INVESTIGATING);
      expect(ctx.getCurrentStatus()).toBe(WorkItemStatus.INVESTIGATING);
    });

    it('should NOT allow OPEN → RESOLVED (skip state)', () => {
      const ctx = new WorkItemContext(WorkItemStatus.OPEN);
      expect(() => ctx.transition(WorkItemStatus.RESOLVED)).toThrow(BadRequestException);
    });

    it('should NOT allow OPEN → CLOSED (skip state)', () => {
      const ctx = new WorkItemContext(WorkItemStatus.OPEN);
      expect(() => ctx.transition(WorkItemStatus.CLOSED)).toThrow(BadRequestException);
    });
  });

  describe('INVESTIGATING state', () => {
    it('should transition INVESTIGATING → RESOLVED', () => {
      const ctx = new WorkItemContext(WorkItemStatus.INVESTIGATING);
      const next = ctx.transition(WorkItemStatus.RESOLVED);
      expect(next).toBe(WorkItemStatus.RESOLVED);
    });

    it('should NOT allow INVESTIGATING → OPEN (backwards)', () => {
      const ctx = new WorkItemContext(WorkItemStatus.INVESTIGATING);
      expect(() => ctx.transition(WorkItemStatus.OPEN)).toThrow(BadRequestException);
    });

    it('should NOT allow INVESTIGATING → CLOSED (skip state)', () => {
      const ctx = new WorkItemContext(WorkItemStatus.INVESTIGATING);
      expect(() => ctx.transition(WorkItemStatus.CLOSED)).toThrow(BadRequestException);
    });
  });

  describe('RESOLVED state', () => {
    it('should transition RESOLVED → CLOSED', () => {
      const ctx = new WorkItemContext(WorkItemStatus.RESOLVED);
      const next = ctx.transition(WorkItemStatus.CLOSED);
      expect(next).toBe(WorkItemStatus.CLOSED);
    });

    it('should NOT allow RESOLVED → OPEN (backwards)', () => {
      const ctx = new WorkItemContext(WorkItemStatus.RESOLVED);
      expect(() => ctx.transition(WorkItemStatus.OPEN)).toThrow(BadRequestException);
    });
  });

  describe('CLOSED state (terminal)', () => {
    it('should NOT allow any transition from CLOSED', () => {
      const ctx = new WorkItemContext(WorkItemStatus.CLOSED);
      expect(() => ctx.transition(WorkItemStatus.OPEN)).toThrow(BadRequestException);
      expect(() => ctx.transition(WorkItemStatus.INVESTIGATING)).toThrow(BadRequestException);
      expect(() => ctx.transition(WorkItemStatus.RESOLVED)).toThrow(BadRequestException);
    });
  });

  describe('full forward path', () => {
    it('should traverse OPEN → INVESTIGATING → RESOLVED → CLOSED', () => {
      const ctx = new WorkItemContext(WorkItemStatus.OPEN);
      expect(ctx.transition(WorkItemStatus.INVESTIGATING)).toBe(WorkItemStatus.INVESTIGATING);
      expect(ctx.transition(WorkItemStatus.RESOLVED)).toBe(WorkItemStatus.RESOLVED);
      expect(ctx.transition(WorkItemStatus.CLOSED)).toBe(WorkItemStatus.CLOSED);
    });
  });
});

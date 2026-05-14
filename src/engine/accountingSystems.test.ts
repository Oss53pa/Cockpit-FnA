import { describe, it, expect } from 'vitest';
import { getClassifier, SYSCOHADA_CLASSIFIER, PCG_FR_CLASSIFIER, NEUTRAL_CLASSIFIER } from './accountingSystems';

describe('accountingSystems', () => {
  describe('SYSCOHADA', () => {
    const c = SYSCOHADA_CLASSIFIER;
    it('classRoot : 2 premiers chiffres', () => {
      expect(c.classRoot('411001')).toBe('41');
      expect(c.classRoot('401')).toBe('40');
      expect(c.classRoot('408100')).toBe('40');
      expect(c.classRoot('7')).toBe('7');
      expect(c.classRoot('')).toBe('');
    });
    it('isParentAccount : true si <= 3 chiffres', () => {
      expect(c.isParentAccount('411')).toBe(true);
      expect(c.isParentAccount('401')).toBe(true);
      expect(c.isParentAccount('411100')).toBe(false);
      expect(c.isParentAccount('411001')).toBe(false);
    });
    it('topClass : 1er chiffre', () => {
      expect(c.topClass('411100')).toBe('4');
      expect(c.topClass('701')).toBe('7');
      expect(c.topClass('')).toBe('');
    });
  });

  describe('PCG_FR', () => {
    const c = PCG_FR_CLASSIFIER;
    it('classRoot : 3 premiers chiffres', () => {
      expect(c.classRoot('411001')).toBe('411');
      expect(c.classRoot('401')).toBe('401');
      expect(c.classRoot('40')).toBe('40');
    });
    it('isParentAccount : true si <= 3 chiffres', () => {
      expect(c.isParentAccount('411')).toBe(true);
      expect(c.isParentAccount('411100')).toBe(false);
    });
  });

  describe('Neutral (IFRS/US_GAAP)', () => {
    const c = NEUTRAL_CLASSIFIER;
    it('classRoot : compte entier', () => {
      expect(c.classRoot('Cash-001')).toBe('Cash-001');
    });
    it('isParentAccount : toujours false (pas de plan structuré)', () => {
      expect(c.isParentAccount('Cash')).toBe(false);
    });
  });

  describe('getClassifier dispatch', () => {
    it('défaut = SYSCOHADA', () => {
      expect(getClassifier(undefined).system).toBe('SYSCOHADA');
      expect(getClassifier('autre').system).toBe('SYSCOHADA');
    });
    it('PCG_FR', () => {
      expect(getClassifier('PCG_FR').system).toBe('PCG_FR');
    });
    it('IFRS / US_GAAP → neutral', () => {
      expect(getClassifier('IFRS').system).toBe('IFRS');
      expect(getClassifier('US_GAAP').system).toBe('IFRS'); // alias neutral
    });
  });
});

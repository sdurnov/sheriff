import { describe, expect, test, it } from 'vitest';
import {
  DependencyCheckContext,
  DependencyRulesConfig,
} from '../../config/dependency-rules-config';
import { isDependencyAllowed } from '../is-dependency-allowed';
import { FsPath } from '../../file-info/fs-path';
import { sameTag } from '../same-tag';
import { noDependencies } from '../no-dependencies';
import { NoDependencyRuleForTagError } from '../../error/user-error';
import '../../test/expect.extensions';

type TestParams = [string, boolean][];

const createMockDependencyCheckContext = (
  overrides?: Partial<DependencyCheckContext>,
): DependencyCheckContext => ({
  fromModulePath: '' as FsPath,
  toModulePath: '' as FsPath,
  fromFilePath: '' as FsPath,
  toFilePath: '' as FsPath,
  fromTags: [],
  toTags: [],
  ...overrides,
});

const dummyContext: DependencyCheckContext = createMockDependencyCheckContext({
  fromModulePath: '/project/moduleFrom' as FsPath,
  toModulePath: '/project/moduleTo' as FsPath,
  fromFilePath: '/project/moduleFrom/some.component.ts' as FsPath,
  toFilePath: '/project/cool.service.ts' as FsPath,
  fromTags: ['domain:customers'],
  toTags: ['domain:holidays'],
});

const createAssertsForConfig = (config: DependencyRulesConfig) => {
  return {
    assertValid(from: string, to: string | string[]) {
      expect(
        isDependencyAllowed(
          from,
          Array.isArray(to) ? to : [to],
          config,
          createMockDependencyCheckContext(),
        ),
      ).toBe(true);
    },
    assertInvalid(from: string, to: string | string[]) {
      expect(
        isDependencyAllowed(
          from,
          Array.isArray(to) ? to : [to],
          config,
          createMockDependencyCheckContext(),
        ),
      ).toBe(false);
    },

    assert(from: string, to: string | string[], expected: boolean) {
      expect(
        isDependencyAllowed(
          from,
          Array.isArray(to) ? to : [to],
          config,
          createMockDependencyCheckContext(),
        ),
      ).toBe(expected);
    },
  };
};

describe('check dependency rules', () => {
  test('single string rule', () => {
    const { assertValid, assertInvalid } = createAssertsForConfig({
      'type:feature': 'type:ui',
      'type:ui': '',
    });

    assertValid('type:feature', 'type:ui');
    assertInvalid('type:ui', 'type:feature');
  });

  test('multiple string rules', () => {
    const { assertValid, assertInvalid } = createAssertsForConfig({
      'type:feature': ['type:data', 'type:ui'],
    });

    assertValid('type:feature', 'type:ui');
    assertInvalid('type:feature', 'domain:abc');
  });

  test('same tag is not automatically allowed', () => {
    const { assertInvalid } = createAssertsForConfig({ 'type:feature': [] });

    assertInvalid('type:feature', 'type:feature');
  });

  for (const [to, isAllowed] of [
    ['type:ui', true],
    ['type:data', true],
    ['domain:shared', false],
    ['super-type:shared', false],
  ] as TestParams) {
    test(`single matcher function for ${to} should be allowed: ${isAllowed}`, () => {
      const { assert } = createAssertsForConfig({
        'type:feature': [({ to }) => to.startsWith('type')],
      });

      assert('type:feature', to, isAllowed);
    });
  }

  it('should throw an error if tag is not configured', () => {
    const config: DependencyRulesConfig = {
      'type:feature': 'test:ui',
    };

    expect(() =>
      isDependencyAllowed('type:funktion', ['noop'], config, dummyContext),
    ).toThrowUserError(new NoDependencyRuleForTagError('type:funktion'));
  });

  it('should pass from, to, fromModulePath, fromFilePath, toModulePath, toFilePath to function', () => {
    isDependencyAllowed(
      'domain:customers',
      ['domain:holidays'],
      {
        'domain:customers': (context) => {
          expect(context).toStrictEqual({
            from: 'domain:customers',
            to: 'domain:holidays',
            ...dummyContext,
          });
          return true;
        },
      },
      dummyContext,
    );
  });

  for (const [to, isAllowed] of [
    ['domain:customers', true],
    ['domain:shared', true],
    ['domain:holidays', false],
  ] as TestParams) {
    it(`should support both string and function for a rule and should return for ${to}: ${isAllowed}`, () => {
      const { assert } = createAssertsForConfig({
        'domain:customers': [
          'domain:shared',
          ({ to }) => to === 'domain:customers',
        ],
      });

      assert('domain:customers', to, isAllowed);
    });
  }

  for (const [to, isAllowed] of [
    ['domain:customers', true],
    ['domain:shared', true],
    ['domain:holidays', false],
  ] as TestParams) {
    it(`should return ${isAllowed} for catch all for ${to}`, () => {
      const { assert } = createAssertsForConfig({
        'domain:*': [
          ({ from, to }) => {
            return from === to || to === 'domain:shared';
          },
        ],
      });

      assert('domain:customers', to, isAllowed);
    });
  }

  it('should run multiple checks, if tag is configured multiple times', () => {
    const { assertValid } = createAssertsForConfig({
      'domain:*': ({ from, to }) => from === to,
      'domain:bookings': 'domain:customers:api',
    });

    assertValid('domain:bookings', 'domain:customers:api');
  });

  it('should have access to a module when of the tags allow it', () => {
    const { assertValid } = createAssertsForConfig({
      'domain:*': [({ from, to }) => from === to, 'shared'],
      'type:feature': ['type:data', 'type:ui'],
    });

    assertValid('domain:bookings', ['shared', 'type:shared']);
  });

  it('should allow wildcard in rule values as well', () => {
    const { assertValid } = createAssertsForConfig({
      'type:feature': ['type:data', 'type:ui', 'shared:*'],
    });

    assertValid('type:feature', 'shared:ui');
  });

  for (const [to, from, isAllowed] of [
    ['domain:customers', 'domain:customers', true],
    ['domain:holidays', 'domain:holidays', true],
    ['domain:customers', 'domain:holidays', false],
    ['domain:holidays', 'domain:customers', false],
  ] as [string, string, boolean][]) {
    it(`should work with pre-defined \`sameTag\` from ${from} to ${to}`, () => {
      const { assert } = createAssertsForConfig({
        'domain:*': sameTag,
      });

      assert(from, to, isAllowed);
    });
  }

  it.each(['type:model', '', 'shared'])(
    'should allow no dependencies with `noDependencies` on %s',
    (toTag) => {
      const { assertInvalid } = createAssertsForConfig({
        'type:model': noDependencies,
      });

      assertInvalid('type:model', toTag);
    },
  );

  describe('fromTags and toTags', () => {
    it('should provide fromTags in the context object', () => {
      isDependencyAllowed(
        'domain:customers',
        ['domain:holidays'],
        {
          'domain:customers': (context) => {
            expect(Array.isArray(context.fromTags)).toBe(true);
            expect(Array.isArray(context.toTags)).toBe(true);
            return true;
          },
        },
        createMockDependencyCheckContext({
          fromTags: ['domain:customers', 'type:feature'],
          toTags: ['domain:holidays', 'type:ui'],
        }),
      );
    });

    it('should provide toTags in the context object', () => {
      isDependencyAllowed(
        'domain:customers',
        ['domain:holidays'],
        {
          'domain:customers': (context) => {
            expect(context.toTags).toEqual(['domain:holidays', 'type:ui']);
            return true;
          },
        },
        createMockDependencyCheckContext({
          fromTags: ['domain:customers'],
          toTags: ['domain:holidays', 'type:ui'],
        }),
      );
    });

    it('should allow complex cross-domain rules using fromTags and toTags', () => {
      const config = {
        // Allow access to shared domain from any domain
        // but forbid cross-domain access except for API
        '*': ({ fromTags, toTags }: { fromTags: string[]; toTags: string[] }) => {
          const fromDomain = fromTags.find((t: string) => t.startsWith('domain:'));
          const toDomain = toTags.find((t: string) => t.startsWith('domain:'));
          const fromType = fromTags.find((t: string) => t.startsWith('type:'));
          const toType = toTags.find((t: string) => t.startsWith('type:'));

          // Allow access to shared domain
          if (toDomain === 'domain:shared') return true;

          // Allow API access across domains
          if (fromType === 'type:api' || toType === 'type:api') return true;

          // Same domain is OK
          if (fromDomain === toDomain) return true;

          return false;
        },
      } as const;

      // Test cases
      expect(
        isDependencyAllowed(
          'domain:customers',
          ['domain:shared'],
          config,
          createMockDependencyCheckContext({
            fromTags: ['domain:customers'],
            toTags: ['domain:shared'],
          }),
        ),
      ).toBe(true);

      expect(
        isDependencyAllowed(
          'domain:customers',
          ['domain:holidays'],
          config,
          createMockDependencyCheckContext({
            fromTags: ['domain:customers'],
            toTags: ['domain:holidays'],
          }),
        ),
      ).toBe(false);

      expect(
        isDependencyAllowed(
          'type:api',
          ['domain:holidays'],
          config,
          createMockDependencyCheckContext({
            fromTags: ['type:api', 'domain:customers'],
            toTags: ['domain:holidays', 'type:ui'],
          }),
        ),
      ).toBe(true);

      expect(
        isDependencyAllowed(
          'domain:customers',
          ['type:api'],
          config,
          createMockDependencyCheckContext({
            fromTags: ['domain:customers', 'type:feature'],
            toTags: ['type:api', 'domain:holidays'],
          }),
        ),
      ).toBe(true);

      expect(
        isDependencyAllowed(
          'domain:customers',
          ['domain:customers'],
          config,
          createMockDependencyCheckContext({
            fromTags: ['domain:customers'],
            toTags: ['domain:customers'],
          }),
        ),
      ).toBe(true);
    });

    it('should allow rule based on multiple tags using fromTags and toTags', () => {
      const config = {
        // Only allow feature -> data access within same domain
        // or feature -> feature access
        'type:feature': ({ fromTags, toTags }: { fromTags: string[]; toTags: string[] }) => {
          const fromDomain = fromTags.find((t: string) => t.startsWith('domain:'));
          const toDomain = toTags.find((t: string) => t.startsWith('domain:'));
          const toType = toTags.find((t: string) => t.startsWith('type:'));

          // Allow feature -> data within same domain
          if (toType === 'type:data' && fromDomain === toDomain) return true;

          // Allow feature -> feature
          if (toType === 'type:feature') return true;

          return false;
        },
      } as const;

      expect(
        isDependencyAllowed(
          'type:feature',
          ['type:feature'],
          config,
          createMockDependencyCheckContext({
            toTags: ['domain:customers', 'type:feature'],
          }),
        ),
      ).toBe(true);

      // No type tag should fail
      expect(
        isDependencyAllowed(
          'type:feature',
          ['domain:customers'],
          config,
          createMockDependencyCheckContext({
            fromTags: ['domain:customers', 'type:feature'],
            toTags: ['domain:customers'],
          }),
        ),
      ).toBe(false);
    });

    it('should support wildcard rules with fromTags and toTags', () => {
      const config = {
        '*': ({ fromTags, toTags }: { fromTags: string[]; toTags: string[] }) => {
          const fromDomain = fromTags.find((t: string) => t.startsWith('domain:'));
          const toDomain = toTags.find((t) => t.startsWith('domain:'));

          // Same domain always allowed
          if (fromDomain === toDomain) return true;

          // Only allow cross-domain access to shared
          return toDomain === 'domain:shared';
        },
      } as const;

      expect(
        isDependencyAllowed(
          'domain:customers',
          ['domain:customers'],
          config,
          createMockDependencyCheckContext({
            fromTags: ['domain:customers'],
            toTags: ['domain:customers'],
          }),
        ),
      ).toBe(true);

      expect(
        isDependencyAllowed(
          'domain:customers',
          ['domain:shared'],
          config,
          createMockDependencyCheckContext({
            fromTags: ['domain:customers'],
            toTags: ['domain:shared'],
          }),
        ),
      ).toBe(true);

      expect(
        isDependencyAllowed(
          'domain:customers',
          ['domain:holidays'],
          config,
          createMockDependencyCheckContext({
            fromTags: ['domain:customers'],
            toTags: ['domain:holidays'],
          }),
        ),
      ).toBe(false);
    });

    it('should work with string rules and function rules using fromTags/toTags', () => {
      const { assertValid } = createAssertsForConfig({
        // String rule still works
        'type:feature': 'type:ui',
        // Function rule can use fromTags/toTags
        'type:ui': ({ fromTags, toTags }) => {
          const fromDomain = fromTags.find((t) => t.startsWith('domain:'));
          const toDomain = toTags.find((t) => t.startsWith('domain:'));
          return fromDomain === toDomain;
        },
      });

      // String rule works
      assertValid('type:feature', 'type:ui');

      // Function rule uses fromTags/toTags
      isDependencyAllowed(
        'type:ui',
        ['domain:customers'],
        {
          'type:ui': ({ fromTags, toTags }) => {
            const fromDomain = fromTags.find((t) => t.startsWith('domain:'));
            const toDomain = toTags.find((t) => t.startsWith('domain:'));
            return fromDomain === toDomain;
          },
        },
        createMockDependencyCheckContext({
          fromTags: ['domain:customers', 'type:ui'],
          toTags: ['domain:customers'],
        }),
      );
    });

    it('should include all context properties in matcher function', () => {
      isDependencyAllowed(
        'domain:customers',
        ['domain:holidays'],
        {
          'domain:customers': (context) => {
            expect(context.from).toBe('domain:customers');
            expect(context.to).toBe('domain:holidays');
            expect(context.fromTags).toEqual(['domain:customers']);
            expect(context.toTags).toEqual(['domain:holidays']);
            expect(context.fromModulePath).toBeDefined();
            expect(context.toModulePath).toBeDefined();
            expect(context.fromFilePath).toBeDefined();
            expect(context.toFilePath).toBeDefined();
            return true;
          },
        },
        createMockDependencyCheckContext({
          fromModulePath: '/project/customers' as FsPath,
          toModulePath: '/project/holidays' as FsPath,
          fromFilePath: '/project/customers/index.ts' as FsPath,
          toFilePath: '/project/holidays/index.ts' as FsPath,
          fromTags: ['domain:customers'],
          toTags: ['domain:holidays'],
        }),
      );
    });

    it('should handle empty fromTags and toTags arrays', () => {
      const { assertInvalid } = createAssertsForConfig({
        '*': ({ fromTags, toTags }: { fromTags: string[]; toTags: string[] }) => {
          // If no tags, deny by default
          if (fromTags.length === 0 || toTags.length === 0) return false;
          return true;
        },
      });

      assertInvalid('no-tag', 'other-tag');
    });

    it('should allow rule that checks for presence of specific tags', () => {
      const rule = (context: { from: string; to: string } & Required<DependencyCheckContext>) => {
        return context.toTags.includes('type:shared');
      };

      // Test case 1: toTags contains type:shared
      const result1 = isDependencyAllowed(
        'domain:customers',
        ['domain:shared'],
        { 'domain:customers': rule },
        createMockDependencyCheckContext({
          fromTags: ['domain:customers'],
          toTags: ['domain:shared', 'type:shared'],
        }),
      );

      expect(result1).toBe(true);

      // Test case 2: toTags does not contain type:shared
      const result2 = isDependencyAllowed(
        'domain:customers',
        ['domain:holidays'],
        { 'domain:customers': rule },
        createMockDependencyCheckContext({
          fromTags: ['domain:customers'],
          toTags: ['domain:holidays', 'type:ui'],
        }),
      );

      expect(result2).toBe(false);
    });
  });
});

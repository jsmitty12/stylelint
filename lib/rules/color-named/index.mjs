import valueParser from 'postcss-value-parser';

import { isRegExp, isString } from '../../utils/validateTypes.mjs';
import { isValueFunction, isValueWord } from '../../utils/typeGuards.mjs';
import { acceptCustomIdentsProperties } from '../../reference/properties.mjs';
import { colord } from './colordUtils.mjs';
import { declarationValueIndex } from '../../utils/nodeFieldIndices.mjs';
import isComma from '../../utils/isComma.mjs';
import isStandardSyntaxFunction from '../../utils/isStandardSyntaxFunction.mjs';
import isStandardSyntaxValue from '../../utils/isStandardSyntaxValue.mjs';
import { mayIncludeRegexes } from '../../utils/regexes.mjs';
import { namedColorsKeywords } from '../../reference/keywords.mjs';
import optionsMatches from '../../utils/optionsMatches.mjs';
import report from '../../utils/report.mjs';
import ruleMessages from '../../utils/ruleMessages.mjs';
import validateOptions from '../../utils/validateOptions.mjs';

const ruleName = 'color-named';

const messages = ruleMessages(ruleName, {
	expected: (actual, expected) => `Expected "${actual}" to be "${expected}"`,
	rejected: (keyword) => `Disallowed named color "${keyword}"`,
});

const meta = {
	url: 'https://stylelint.io/user-guide/rules/color-named',
};

// Todo tested on case insensitivity
const NODE_TYPES = new Set(['word', 'function']);

/** @type {import('stylelint').CoreRules[typeof ruleName]} */
const rule = (primary, secondaryOptions) => {
	return (root, result) => {
		const validOptions = validateOptions(
			result,
			ruleName,
			{
				actual: primary,
				possible: ['never', 'always-where-possible'],
			},
			{
				actual: secondaryOptions,
				possible: {
					ignoreProperties: [isString, isRegExp],
					ignore: ['inside-function', 'custom-property-fallbacks'],
				},
				optional: true,
			},
		);

		if (!validOptions) {
			return;
		}

		const ignoreCustomPropertyFallbacks = optionsMatches(
			secondaryOptions,
			'ignore',
			'custom-property-fallbacks',
		);

		const ignoreInsideFunction = optionsMatches(secondaryOptions, 'ignore', 'inside-function');

		root.walkDecls((decl) => {
			if (acceptCustomIdentsProperties.has(decl.prop)) {
				return;
			}

			// Return early if the property is to be ignored
			if (optionsMatches(secondaryOptions, 'ignoreProperties', decl.prop)) {
				return;
			}

			const { value: declValue } = decl;

			if (primary === 'never' && !mayIncludeRegexes.namedColor.test(declValue)) {
				return;
			}

			if (
				primary === 'always-where-possible' &&
				!mayIncludeRegexes.validHex.test(declValue) &&
				!mayIncludeRegexes.colorFunction.test(declValue) &&
				!mayIncludeRegexes.grayFunction.test(declValue)
			) {
				return;
			}

			/**
			 * @param {import('postcss-value-parser').Node[]} nodes
			 * @param {boolean} isInsideVarFallback
			 */
			function checkNodes(nodes, isInsideVarFallback) {
				for (const node of nodes) {
					const value = node.value;
					const type = node.type;
					const sourceIndex = node.sourceIndex;

					if (ignoreInsideFunction && isValueFunction(node)) {
						continue;
					}

					if (!isStandardSyntaxFunction(node)) {
						continue;
					}

					if (isStandardSyntaxValue(value) && NODE_TYPES.has(type)) {
						if (
							primary === 'never' &&
							isValueWord(node) &&
							namedColorsKeywords.has(value.toLowerCase())
						) {
							if (!(ignoreCustomPropertyFallbacks && isInsideVarFallback)) {
								complain(
									messages.rejected,
									[value],
									decl,
									declarationValueIndex(decl) + sourceIndex,
									value.length,
								);
							}
						} else if (primary === 'always-where-possible') {
							let rawColorString;
							let colorString;

							if (isValueFunction(node)) {
								rawColorString = valueParser.stringify(node);

								// First by checking for alternative color function representations ...
								// Remove all spaces to match what's in `representations`
								colorString = rawColorString
									.replace(/\s*([,/()])\s*/g, '$1')
									.replace(/\s{2,}/g, ' ');
							} else if (isValueWord(node) && value.startsWith('#')) {
								// Then by checking for alternative hex representations
								rawColorString = colorString = value;
							}

							if (colorString !== undefined) {
								if (!(ignoreCustomPropertyFallbacks && isInsideVarFallback)) {
									const color = colord(colorString);

									if (color.isValid()) {
										const namedColor = color.toName();

										if (namedColor && namedColor.toLowerCase() !== 'transparent') {
											complain(
												messages.expected,
												[colorString, namedColor],
												decl,
												declarationValueIndex(decl) + sourceIndex,
												rawColorString.length,
											);
										}
									}
								}
							}
						}
					}

					if (isValueFunction(node)) {
						const functionName = value.toLowerCase();

						if (functionName === 'var') {
							let inFallback = false;

							for (const childNode of node.nodes) {
								if (!inFallback) {
									if (isComma(childNode)) {
										inFallback = true;
									} else {
										checkNodes([childNode], isInsideVarFallback);
									}
								} else {
									checkNodes([childNode], true);
								}
							}

							continue;
						}

						checkNodes(node.nodes, isInsideVarFallback);
					}
				}
			}

			checkNodes(valueParser(declValue).nodes, false);
		});

		/**
		 * @param {(typeof messages)[keyof typeof messages]} message
		 * @param {string[]} messageArgs
		 * @param {import('postcss').Node} node
		 * @param {number} index
		 * @param {number} length
		 */
		function complain(message, messageArgs, node, index, length) {
			report({
				result,
				ruleName,
				message,
				messageArgs,
				node,
				index,
				endIndex: index + length,
			});
		}
	};
};

rule.ruleName = ruleName;
rule.messages = messages;
rule.meta = meta;
export default rule;

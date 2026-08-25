import valueParser from 'postcss-value-parser';

import { isValueFunction, isValueWord } from '../../utils/typeGuards.mjs';
import { declarationValueIndex } from '../../utils/nodeFieldIndices.mjs';
import getDeclarationValue from '../../utils/getDeclarationValue.mjs';
import isComma from '../../utils/isComma.mjs';
import { mayIncludeRegexes } from '../../utils/regexes.mjs';
import optionsMatches from '../../utils/optionsMatches.mjs';
import report from '../../utils/report.mjs';
import ruleMessages from '../../utils/ruleMessages.mjs';
import validateOptions from '../../utils/validateOptions.mjs';

const ruleName = 'color-no-hex';

const messages = ruleMessages(ruleName, {
	rejected: (hex) => `Disallowed hex color "${hex}"`,
});

const meta = {
	url: 'https://stylelint.io/user-guide/rules/color-no-hex',
};

const HEX = /^#[\da-z]+$/i;

/** @type {import('stylelint').CoreRules[typeof ruleName]} */
const rule = (primary, secondaryOptions) => {
	return (root, result) => {
		const validOptions = validateOptions(
			result,
			ruleName,
			{ actual: primary },
			{
				actual: secondaryOptions,
				possible: {
					ignore: ['custom-property-fallbacks'],
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

		root.walkDecls((decl) => {
			if (!mayIncludeRegexes.hexColor.test(decl.value)) return;

			const parsedValue = valueParser(getDeclarationValue(decl));

			/**
			 * @param {import('postcss-value-parser').Node[]} nodes
			 * @param {boolean} isInsideVarFallback
			 */
			function checkNodes(nodes, isInsideVarFallback) {
				for (const node of nodes) {
					if (isValueFunction(node)) {
						const functionName = node.value.toLowerCase();

						if (functionName === 'url') continue;

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
						continue;
					}

					if (!isHexColor(node)) continue;

					if (ignoreCustomPropertyFallbacks && isInsideVarFallback) continue;

					const index = declarationValueIndex(decl) + node.sourceIndex;
					const endIndex = index + node.value.length;

					report({
						message: messages.rejected,
						messageArgs: [node.value],
						node: decl,
						index,
						endIndex,
						result,
						ruleName,
					});
				}
			}

			checkNodes(parsedValue.nodes, false);
		});
	};
};

/**
 * @param {import('postcss-value-parser').Node} node
 */
function isHexColor(node) {
	return isValueWord(node) && HEX.test(node.value);
}

rule.ruleName = ruleName;
rule.messages = messages;
rule.meta = meta;
export default rule;

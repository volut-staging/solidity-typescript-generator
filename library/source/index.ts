import { keccak256 } from 'js-sha3'

type Primitive = 'uint8' | 'uint64' | 'uint256' | 'bool' | 'string' | 'address' | 'bytes4' | 'bytes20' | 'bytes32' | 'bytes' | 'bytes[]' | 'int256' | 'tuple' | 'address[]' | 'uint8[]' | 'uint256[]' | 'int256[]' | 'bytes32[]' | 'tuple[]'

interface AbiParameter {
	name: string,
	type: Primitive,
	internalType: any;
	components?: Array<AbiParameter>
}

export interface AbiEventParameter extends AbiParameter {
	indexed: boolean,
}

interface AbiEntry {
	type: string
}

interface AbiFunction extends AbiEntry {
	name: string,
	type: 'function',
	constant: boolean,
	payable: boolean,
	stateMutability: 'pure' | 'view' | 'payable' | 'nonpayable',
	inputs: Array<AbiParameter>,
	outputs: Array<AbiParameter>,
}

export interface AbiEvent {
	name: string,
	type: 'event',
	inputs: Array<AbiEventParameter>,
	anonymous: boolean,
}

export interface EventDescription {
	name: string
	signature: string
	signatureHash: string
	parameters: Array<AbiEventParameter>
}

type Abi = Array<AbiEntry>

interface CompilerOutput {
	contracts: {
		[globalName: string]: {
			[contractName: string]: {
				abi: Abi
			}
		}
	}
}

export function generateContractInterfaces(contractsOutput: CompilerOutput): string {
	const contractInterfaces: Array<string> = []
	const eventDescriptions: Map<string,string> = new Map<string, string>()

	for (let globalName in contractsOutput.contracts) {
		for (let contractName in contractsOutput.contracts[globalName]) {
			const contractAbi: Abi = contractsOutput.contracts[globalName][contractName].abi
			if (contractAbi.length == 0) continue
			contractInterfaces.push(contractInterfaceTemplate(contractName, contractAbi))
			for (let abiEvent of contractAbi.filter(abiEntry => abiEntry.type === 'event').map(abiEntry => <AbiEvent>abiEntry)) {
				const eventDescription = eventDescriptionTemplate(abiEvent)
				eventDescriptions.set(eventDescription.substring(2, 68), eventDescription)
			}
		}
	}

	return `// THIS FILE IS AUTOMATICALLY GENERATED BY \`generateContractInterfaces.ts\`. DO NOT EDIT BY HAND'

export type Primitive = 'uint8' | 'uint64' | 'uint256' | 'bool' | 'string' | 'address' | 'bytes4' | 'bytes20' | 'bytes32' | 'bytes' | 'bytes[]' | 'int256' | 'tuple' | 'address[]' | 'uint8[]' | 'uint256[]' | 'int256[]' | 'bytes32[]' | 'tuple[]'

export interface AbiParameter {
	name: string
	type: Primitive
	components?: Array<AbiParameter>
}

export interface AbiEventParameter extends AbiParameter {
	indexed: boolean
}

export interface AbiFunction {
	name: string
	type: 'function' | 'constructor' | 'fallback'
	stateMutability: 'pure' | 'view' | 'payable' | 'nonpayable'
	constant: boolean
	payable: boolean
	inputs: Array<AbiParameter>
	outputs: Array<AbiParameter>
}

export interface Transaction<TBigNumber> {
	to: string
	from?: string
	data: string
	value?: TBigNumber
}

export interface RawEvent {
	data: string
	topics: Array<string>
}

export interface TransactionReceipt {
	status: number
	logs: Array<RawEvent>
}

export interface Event {
	name: string
	parameters: unknown
}

export interface EventDescription {
	name: string
	signature: string
	signatureHash: string
	parameters: Array<AbiEventParameter>
}

export const eventDescriptions: { [signatureHash: string]: EventDescription } = {
${Array.of(...eventDescriptions.values()).map(x => `\t${x}`).join(',\n')}
}

class ContractError extends Error {
  abi:string;
  parameters: string;

  constructor(abi:AbiFunction, parameters:Array<any>,  ...args:Array<any>) {
    super(...args);

    this.setAbi(abi);
    this.setParameters(parameters);

    Error.captureStackTrace(this, ContractError);
  }

  setAbi = (abi: AbiFunction) => {
    this.abi = JSON.stringify(abi);
  }

  setParameters = (parameters: Array<any>) => {
    this.parameters = JSON.stringify(parameters);
  }
}

export interface Dependencies<TBigNumber> {
	// TODO: get rid of some of these dependencies in favor of baked in solutions
	keccak256(utf8String: string): string
	encodeParams(abi: AbiFunction, parameters: Array<any>): string
	decodeParams(abi: Array<AbiParameter>, encoded: string): Array<any>
	getDefaultAddress(): Promise<string | undefined>
	call(transaction: Transaction<TBigNumber>): Promise<string>
	estimateGas(transaction: Transaction<TBigNumber>): Promise<TBigNumber>
	submitTransaction(transaction: Transaction<TBigNumber>): Promise<TransactionReceipt>
}


/**
 * By convention, pure/view methods have a \`_\` suffix on them indicating to the caller that the function will be executed locally and return the function's result.  payable/nonpayable functions have both a local version and a remote version (distinguished by the trailing \`_\`).  If the remote method is called, you will only get back a transaction hash which can be used to lookup the transaction receipt for success/failure (due to EVM limitations you will not get the function results back).
 */
export class Contract<TBigNumber> {
	protected readonly dependencies: Dependencies<TBigNumber>
	public readonly address: string

	protected constructor(dependencies: Dependencies<TBigNumber>, address: string) {
		this.dependencies = dependencies
		this.address = address
	}

	protected async localCall(abi: AbiFunction, parameters: Array<any>, sender?: string, attachedEth?: TBigNumber): Promise<any> {
		const from = sender || await this.dependencies.getDefaultAddress()
		const data = this.encodeMethod(abi, parameters)
		const transaction = Object.assign({ to: this.address, data: data }, attachedEth ? { value: attachedEth } : {}, from ? { from: from } : {})
		const result = await this.dependencies.call(transaction)
		if (result === '0x') throw new ContractError(abi, parameters, \`Call returned '0x' indicating failure.\`)
		return this.dependencies.decodeParams(abi.outputs, result)
	}

	protected async remoteCall(abi: AbiFunction, parameters: Array<any>, txName: string, sender?: string, attachedEth?: TBigNumber): Promise<Array<Event>> {
		const from = sender || await this.dependencies.getDefaultAddress()
		const data = this.encodeMethod(abi, parameters)
		const transaction = Object.assign({ to: this.address, data: data }, attachedEth ? { value: attachedEth } : {}, from ? { from: from } : {})
		const transactionReceipt = await this.dependencies.submitTransaction(transaction)
		if (transactionReceipt.status != 1) {
			throw new ContractError(abi, parameters, \`Tx \${txName} failed: \${transactionReceipt}\`)
		}
		return this.decodeEvents(transactionReceipt.logs)
	}

	protected async estimateGas(abi: AbiFunction, parameters: Array<any>, txName: string, sender?: string, attachedEth?: TBigNumber): Promise<TBigNumber> {
		const from = sender || await this.dependencies.getDefaultAddress()
		const data = this.encodeMethod(abi, parameters)
		const transaction = Object.assign({ to: this.address, data: data }, attachedEth ? { value: attachedEth } : {}, from ? { from: from } : {})
	
		return this.dependencies.estimateGas(transaction);	
	}

	private encodeMethod(abi: AbiFunction, parameters: Array<any>): string {
		return \`\${this.hashSignature(abi)}\${this.dependencies.encodeParams(abi, parameters)}\`
	}

	private decodeEvents(rawEvents: Array<RawEvent>): Array<Event> {
		const decodedEvents: Array<Event> = []
		rawEvents.forEach(rawEvent => {
			const decodedEvent = this.tryDecodeEvent(rawEvent)
			if (decodedEvent) decodedEvents.push(decodedEvent)
		})
		return decodedEvents
	}

	private tryDecodeEvent(rawEvent: RawEvent): Event | null {
		const signatureHash = rawEvent.topics[0]
		const eventDescription = eventDescriptions[signatureHash]
		if (!eventDescription) return null
		const parameters = this.decodeEventParameters(eventDescription.parameters, rawEvent.topics, rawEvent.data, { eventSignature: eventDescription.signature })
		return { name: eventDescription.name, parameters: parameters }
	}

	private hashSignature(abiFunction: AbiFunction): string {
		const parameters = this.stringifyParams(abiFunction.inputs).join(',')
		const signature = \`\${abiFunction.name}(\${parameters})\`
		return this.dependencies.keccak256(signature).substring(0, 10)
	}

	private stringifyParams(params: Array<AbiParameter>): Array<string> {
		return params.map(param => {
			if (param.type === 'tuple') {
				if (!param.components) throw new Error(\`Expected components when type is \${param.type}\`)
				return \`(\${this.stringifyParams(param.components).join(',')})\`
			} else if (param.type === 'tuple[]') {
				if (!param.components) throw new Error(\`Expected components when type is \${param.type}\`)
				return \`(\${this.stringifyParams(param.components).join(',')})[]\`
			} else {
				return param.type
			}
		})
	}

	private decodeEventParameters(parameters: Array<AbiEventParameter>, topics: Array<string>, data: string, errorContext: { eventSignature: string }): any {
		const indexedTypesForDecoding = parameters.filter(parameter => parameter.indexed).map(this.getTypeForEventDecoding)
		const nonIndexedTypesForDecoding = parameters.filter(parameter => !parameter.indexed)
		const indexedData = \`0x\${topics.slice(1).map(topic => topic.substring(2)).join('')}\`
		const nonIndexedData = data
		// TODO: roll own parameter decoder instead of using dependency
		const decodedIndexedParameters = this.dependencies.decodeParams(indexedTypesForDecoding, indexedData)
		if (!decodedIndexedParameters) throw new Error(\`Failed to decode topics for event \${errorContext.eventSignature}.\\n\${indexedData}\`)
		const decodedNonIndexedParameters = this.dependencies.decodeParams(nonIndexedTypesForDecoding, nonIndexedData)
		if (!decodedNonIndexedParameters) throw new Error(\`Failed to decode data for event \${errorContext.eventSignature}.\\n\${nonIndexedData}\`)
		const result: { [name: string]: any } = {}
		indexedTypesForDecoding.forEach((parameter, i) => result[parameter.name] = decodedIndexedParameters[i])
		nonIndexedTypesForDecoding.forEach((parameter, i) => result[parameter.name] = decodedNonIndexedParameters[i])
		return result
	}

	private getTypeForEventDecoding(parameter: AbiEventParameter): AbiEventParameter {
		if (!parameter.indexed) return parameter
		if (parameter.type !== 'string'
			&& parameter.type !== 'bytes'
			&& !parameter.type.startsWith('tuple')
			&& !parameter.type.endsWith('[]'))
			return parameter
		return Object.assign({}, parameter, { type: 'bytes32' })
	}
}

${contractInterfaces.join('\n')}
`
}

function contractInterfaceTemplate(contractName: string, contractAbi: Abi) {
	const contractMethods: Array<string> = []

	// FIXME: Add support for Solidity function overloads.  Right now overloaded functions are not supported, only the first one seen will servive addition into the following set.
	const seen: Set<string> = new Set()

	const contractFunctions: Array<AbiFunction> = contractAbi
		.filter(abiEntry => abiEntry.type == 'function')
		.map(abiFunction => <AbiFunction>abiFunction)

	for (let abiFunction of contractFunctions) {
		if (seen.has(abiFunction.name)) continue
		if (!abiFunction.constant) {
			contractMethods.push(remoteMethodTemplate(abiFunction, { contractName: contractName}))
		}
		contractMethods.push(localMethodTemplate(abiFunction, { contractName: contractName}))
		seen.add(abiFunction.name)
	}

	return `
export class ${contractName}<TBigNumber> extends Contract<TBigNumber> {
	public constructor(dependencies: Dependencies<TBigNumber>, address: string) {
		super(dependencies, address)
	}

${contractMethods.join('\n\n')}
}
`
}

function eventDescriptionTemplate(abiEvent: AbiEvent): string {
	const signature = toSignature(abiEvent.name, abiEvent.inputs)
	const eventDescription = {
		name: abiEvent.name,
		signature: signature,
		signatureHash: `0x${keccak256(signature)}`,
		parameters: abiEvent.inputs,
	}
	return `'${eventDescription.signatureHash}': ${JSON.stringify(eventDescription)}`
}

function remoteMethodTemplate(abiFunction: AbiFunction, errorContext: { contractName: string }) {
	const argNames: string = toArgNameString(abiFunction)
	const params: string = toParamsString(abiFunction, errorContext)
	const options: string = `{ sender?: string${abiFunction.payable ? ', attachedEth?: TBigNumber' : ''} }`
	return `	public ${abiFunction.name} = async (${params}options?: ${options}): Promise<Array<Event>> => {
		options = options || {}
		const abi: AbiFunction = ${JSON.stringify(abiFunction)}
		return await this.remoteCall(abi, [${argNames}], '${abiFunction.name}', options.sender${abiFunction.payable ? ', options.attachedEth' : ''})
	}
	
	public ${abiFunction.name}_estimateGas = async (${params}options?: ${options}): Promise<TBigNumber> => {
		options = options || {}
		const abi: AbiFunction = ${JSON.stringify(abiFunction)}
		return await this.estimateGas(abi, [${argNames}], '${abiFunction.name}', options.sender${abiFunction.payable ? ', options.attachedEth' : ''})
	}`
}

function localMethodTemplate(abiFunction: AbiFunction, errorContext: { contractName: string }) {
	const argNames: string = toArgNameString(abiFunction)
	const params: string = toParamsString(abiFunction, errorContext)
	const options: string = `{ sender?: string${abiFunction.payable ? ', attachedEth?: TBigNumber' : ''} }`
	const returnType: string = toTsReturnTypeString(abiFunction.outputs, { contractName: errorContext.contractName, functionName: abiFunction.name })
	const returnPromiseType: string = returnType
	const returnValue: string = (abiFunction.outputs.length === 1)
		? `<${returnType}>result[0]`
		: `<${returnType}>result`
	return `	public ${abiFunction.name}_ = async (${params}options?: ${options}): Promise<${returnPromiseType}> => {
		options = options || {}
		const abi: AbiFunction = ${JSON.stringify(abiFunction)}
		${abiFunction.outputs.length !== 0 ? 'const result = ' : ''}await this.localCall(abi, [${argNames}], options.sender${abiFunction.payable ? ', options.attachedEth' : ''})${abiFunction.outputs.length !== 0 ? `\n\t\treturn ${returnValue}` : ''}
	}`
}

function toTsReturnTypeString(abiParameters: AbiParameter[], errorContext: { contractName: string, functionName: string }): string {
	if (abiParameters.length === 0) return `void`
	else if (abiParameters.length === 1) return toTsTypeString(abiParameters[0], errorContext)
	else if (!abiParameters.every(abiParameter => !!abiParameter.name)) throw new Error(`Function ${errorContext.contractName}.${errorContext.functionName} has multiple return values but not all are named.`)
	else return `{${abiParameters.map(abiParameter => `${abiParameter.name}: ${toTsTypeString(abiParameter, errorContext)}`).join(', ')}}`
}

function toTsTypeString(abiParameter: AbiParameter, errorContext: { contractName: string, functionName: string }): string {
	switch(abiParameter.type) {
		case 'uint8':
		case 'uint64':
		case 'uint256':
		case 'int256': {
			return 'TBigNumber'
		}
		case 'string':
		case 'address':
		case 'bytes4':
		case 'bytes20':
		case 'bytes32':
		case 'bytes': {
			return 'string'
		}
		case 'bool': {
			return 'boolean'
		}
		case 'bool[]': {
			return 'Array<boolean>'
		}
		case 'tuple': {
			return `{ ${abiParameter.components!.map(component => `${component.name}: ${toTsTypeString(component, errorContext)}`).join(', ')} }`
		}
		case 'bytes[]':
		case 'address[]': {
			return 'Array<string>'
		}
		case 'uint8[]':
		case 'uint256[]':
		case 'int256[]': {
			return 'Array<TBigNumber>'
		}
		case 'bytes32[]': {
			return 'Array<string>'
		}
		case 'tuple[]': {
			return `Array<{ ${abiParameter.components!.map(component => `${component.name}: ${toTsTypeString(component, errorContext)}`).join(', ')} }>`
		}
		default: {
			throw new Error(`Unrecognized Value in ${errorContext.contractName}.${errorContext.functionName}: ${JSON.stringify(abiParameter)}`)
		}
	}
}

function toArgNameString(abiFunction: AbiFunction) {
	return abiFunction.inputs.map(toParamNameString).join(', ')
}

function toParamsString(abiFunction: AbiFunction, errorContext: { contractName: string }) {
	if (abiFunction.inputs.length == 0) return ''
	return abiFunction.inputs.map((abiParameter, i) => `${toParamNameString(abiParameter, i)}: ${toTsTypeString(abiParameter, { contractName: errorContext.contractName, functionName: abiFunction.name })}`).join(', ') + ', '
}

function toParamNameString(abiParameter: AbiParameter, index: number) {
	if (!abiParameter.name) return `arg${index}`
	else if (abiParameter.name.startsWith('_')) return abiParameter.name.substr(1)
	else return abiParameter.name
}

function toSignature(name: string, params: Array<AbiParameter>): string {
	const parameters = stringifyParamsForSignature(params).join(',')
	return `${name}(${parameters})`
}

function stringifyParamsForSignature(params: Array<AbiParameter>): Array<string> {
	return params.map(param => {
		if (param.type === 'tuple') {
			if (!param.components) throw new Error(`Expected components when type is ${param.type}`)
			return `(${stringifyParamsForSignature(param.components).join(',')})`
		} else if (param.type === 'tuple[]') {
			if (!param.components) throw new Error(`Expected components when type is ${param.type}`)
			return `(${stringifyParamsForSignature(param.components).join(',')})[]`
		} else {
			return param.type
		}
	})
}

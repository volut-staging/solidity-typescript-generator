// THIS FILE IS AUTOMATICALLY GENERATED BY `generateContractInterfaces.ts`. DO NOT EDIT BY HAND'

export type Primitive = 'uint8' | 'uint64' | 'uint256' | 'bool' | 'string' | 'address' | 'bytes20' | 'bytes32' | 'bytes' | 'int256' | 'tuple' | 'address[]' | 'uint256[]' | 'bytes32[]' | 'tuple[]'

export interface AbiParameter {
	name: string,
	type: Primitive,
	components?: Array<AbiParameter>
}

export interface AbiEventParameter extends AbiParameter {
	indexed: boolean,
}

export interface AbiFunction {
	name: string,
	type: 'function' | 'constructor' | 'fallback',
	stateMutability: 'pure' | 'view' | 'payable' | 'nonpayable',
	constant: boolean,
	payable: boolean,
	inputs: Array<AbiParameter>,
	outputs: Array<AbiParameter>,
}

export interface AbiEvent {
	name: string,
	type: 'event',
	inputs: Array<AbiEventParameter>,
	anonymous: boolean,
}

export type Abi = Array<AbiFunction | AbiEvent>

export interface Transaction <TBigNumber> {
	to: string
	from: string
	data: string
	value?: TBigNumber
}

export interface TransactionReceipt {
	status: number
}

export interface Dependencies<TBigNumber> {
	// TODO: get rid of some of these dependencies in favor of baked in solutions
	keccak256(utf8String: string): string
	encodeParams(abi: AbiFunction, parameters: Array<any>): string
	decodeParams(abi: Array<AbiParameter>, encoded: string): Array<any>
	getDefaultAddress(): Promise<string>
	call(transaction: Transaction<TBigNumber>): Promise<string>
	submitTransaction(transaction: Transaction<TBigNumber>): Promise<TransactionReceipt>
}


/**
 * By convention, pure/view methods have a `_` suffix on them indicating to the caller that the function will be executed locally and return the function's result.  payable/nonpayable functions have both a local version and a remote version (distinguished by the trailing `_`).  If the remote method is called, you will only get back a transaction hash which can be used to lookup the transaction receipt for success/failure (due to EVM limitations you will not get the function results back).
 */
export class Contract<TBigNumber> {
	protected readonly dependencies: Dependencies<TBigNumber>
	public readonly address: string

	protected constructor(dependencies: Dependencies<TBigNumber>, address: string) {
		this.dependencies = dependencies
		this.address = address
	}

	private stringifyParams(params: Array<AbiParameter>): Array<string> {
		return params.map(param => {
			if (param.type === 'tuple') {
				if (!param.components) throw new Error(`Expected components when type is ${param.type}`)
				return `(${this.stringifyParams(param.components).join(',')})`
			} else if (param.type === 'tuple[]') {
				if (!param.components) throw new Error(`Expected components when type is ${param.type}`)
				return `(${this.stringifyParams(param.components).join(',')})[]`
			} else {
				return param.type
			}
		})
	}

	private hashSignature(abiFunction: AbiFunction): string {
		const parameters = this.stringifyParams(abiFunction.inputs).join(',')
		const signature = `${abiFunction.name}(${parameters})`
		return this.dependencies.keccak256(signature).substring(0, 10)
	}

	private encodeMethod(abi: AbiFunction, parameters: Array<any>) {
		return `${this.hashSignature(abi)}${this.dependencies.encodeParams(abi, parameters)}`
	}

	protected async localCall(abi: AbiFunction, parameters: Array<any>, sender?: string, attachedEth?: TBigNumber): Promise<any> {
		const from = sender || await this.dependencies.getDefaultAddress()
		const data = this.encodeMethod(abi, parameters)
		const transaction = Object.assign({ from: from, to: this.address, data: data }, attachedEth ? { value: attachedEth } : {})
		const result = await this.dependencies.call(transaction)
		if (result === '0x') throw new Error(`Call returned '0x' indicating failure.`)
		return this.dependencies.decodeParams(abi.outputs, result)
	}

	protected async remoteCall(abi: AbiFunction, parameters: Array<any>, txName: string, sender?: string, attachedEth?: TBigNumber): Promise<void> {
		const from = sender || await this.dependencies.getDefaultAddress()
		const data = this.encodeMethod(abi, parameters)
		const transaction = Object.assign({ from: from, to: this.address, data: data }, attachedEth ? { value: attachedEth } : {})
		const transactionReceipt = await this.dependencies.submitTransaction(transaction)
		if (transactionReceipt.status != 1) {
			throw new Error(`Tx ${txName} failed: ${transactionReceipt}`)
		}
	}
}


export class banana<TBigNumber> extends Contract<TBigNumber> {
	public constructor(dependencies: Dependencies<TBigNumber>, address: string) {
		super(dependencies, address)
	}

	public cherry = async(options?: { sender?: string, attachedEth?: TBigNumber }): Promise<void> => {
		options = options || {}
		const abi: AbiFunction = {"name":"cherry","type":"function","constant":false,"payable":true,"stateMutability":"payable","inputs":[],"outputs":[]}
		await this.remoteCall(abi, [], 'cherry', options.sender, options.attachedEth)
		return
	}

	public cherry_ = async(options?: { sender?: string, attachedEth?: TBigNumber }): Promise<void> => {
		options = options || {}
		const abi: AbiFunction = {"name":"cherry","type":"function","constant":false,"payable":true,"stateMutability":"payable","inputs":[],"outputs":[]}
		await this.localCall(abi, [], options.sender, options.attachedEth)
	}
}


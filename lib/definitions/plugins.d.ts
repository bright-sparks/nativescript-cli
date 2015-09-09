interface IPluginsService {
	add(plugin: string): IFuture<void>; // adds plugin by name, github url, local path and et.
	remove(pluginName: string): IFuture<void>; // removes plugin only by name
	prepare(pluginData: IDependencyData): IFuture<void>;
	getAllInstalledPlugins(): IFuture<IPluginData[]>;
	ensureAllDependenciesAreInstalled(): IFuture<void>;
	afterPrepareAllPlugins(): IFuture<void>;
}

interface IPluginData extends INodeModuleData {
	platformsData: IPluginPlatformsData;
	pluginVariables: IDictionary<IPluginVariableData>;
	pluginPlatformsFolderPath(platform: string): string;
}

interface INodeModuleData {
	name: string;
	version: string;
	fullPath: string;
	isPlugin: boolean;
	moduleInfo: any;
}

interface IPluginPlatformsData {
	ios: string;
	android: string;
}

interface IPluginVariablesService {
	savePluginVariablesInProjectFile(pluginData: IPluginData): IFuture<void>;
	removePluginVariablesFromProjectFile(pluginData: IPluginData): IFuture<void>;
	interpolatePluginVariables(pluginData: IPluginData, configurationFilePath: string): IFuture<void>;
}

interface IPluginVariableData  { // extends the schema + name and value
	default?: string;
	name?: string;
	value?: string;
}
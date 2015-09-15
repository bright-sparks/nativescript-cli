///<reference path="../.d.ts"/>
"use strict";

import helpers = require("./../common/helpers");

export class PluginVariablesService implements IPluginVariablesService {
	private static PLUGIN_VARIABLES_KEY = "variables";

	constructor(private $errors: IErrors,
		private $fs: IFileSystem,
		private $pluginVariablesHelper: IPluginVariablesHelper,
		private $projectData: IProjectData,
		private $projectDataService: IProjectDataService,
		private $prompter: IPrompter,
		private $staticConfig: IStaticConfig) { }

	public savePluginVariablesInProjectFile(pluginData: IPluginData): IFuture<void> {
		return (() => {
			let values = Object.create(null);
			this.executeForAllPluginVariables(pluginData, (pluginVariableData: IPluginVariableData) =>
				(() => {
					let pluginVariableValue = this.getPluginVariableValue(pluginVariableData).wait();
					if(!pluginVariableValue) {
						this.$errors.failWithoutHelp(`Unable to find value for ${pluginVariableData.name} plugin variable from ${pluginData.name} plugin. Ensure the --var option is specified or the plugin variable has default value.`);
					}
					values[pluginVariableData.name] = pluginVariableValue;
				}).future<void>()()).wait();

			this.$projectDataService.initialize(this.$projectData.projectDir);
			this.$projectDataService.setValue(this.getPluginVariablePropertyName(pluginData), values).wait();
		}).future<void>()();
	}

	public removePluginVariablesFromProjectFile(pluginData: IPluginData): IFuture<void> {
		this.$projectDataService.initialize(this.$projectData.projectDir);
		return this.$projectDataService.removeProperty(this.getPluginVariablePropertyName(pluginData));
	}

	public interpolatePluginVariables(pluginData: IPluginData, pluginConfigurationFileContent: string): IFuture<string> {
		return (() => {
			this.executeForAllPluginVariables(pluginData, (pluginVariableData: IPluginVariableData) =>
				(() => {
					if(!pluginVariableData.value) {
						this.$errors.failWithoutHelp(`Unable to find the value for ${pluginVariableData.name} plugin variable into project package.json file. Verify that your package.json file is correct and try again.`);
					}

					pluginConfigurationFileContent = pluginConfigurationFileContent.replace(new RegExp(pluginVariableData.name, "gi"), pluginVariableData.value);
				}).future<void>()()).wait();
			return pluginConfigurationFileContent;
		}).future<string>()();
	}

	private getPluginVariableValue(pluginVariableData: IPluginVariableData): IFuture<string> {
		return (() => {
			let pluginVariableName = pluginVariableData.name;
			let value = this.$pluginVariablesHelper.getPluginVariableFromVarOption(pluginVariableName);
			if(value) {
				value = value[pluginVariableName];
			} else {
				value = pluginVariableData.default;
				if(!value && helpers.isInteractive()) {
					let promptSchema = {
						name: pluginVariableName,
						type: "input",
						message: `Enter value for ${pluginVariableName} variable: `
					};
					let promptData = this.$prompter.get([promptSchema]).wait();
					value = promptData[pluginVariableName];
				}
			}

			return value;
		}).future<string>()();
	}

	private executeForAllPluginVariables(pluginData: IPluginData, action: (pluginVariableData: IPluginVariableData) => IFuture<void>): IFuture<void> {
		return (() => {
			let pluginVariables = pluginData.pluginVariables;
			let pluginVariablesNames = _.keys(pluginVariables);
			_.each(pluginVariablesNames, pluginVariableName => action(this.createPluginVariableData(pluginData, pluginVariableName).wait()).wait());
		}).future<void>()();
	}

	private createPluginVariableData(pluginData: IPluginData, pluginVariableName: string): IFuture<IPluginVariableData> {
		return (() => {
			let variableData = pluginData.pluginVariables[pluginVariableName];

			variableData.name = pluginVariableName;

			this.$projectDataService.initialize(this.$projectData.projectDir);
			let pluginVariableValues = this.$projectDataService.getValue(this.getPluginVariablePropertyName(pluginData)).wait();
			variableData.value = pluginVariableValues ? pluginVariableValues[pluginVariableName] : undefined;

			return variableData;
		}).future<IPluginVariableData>()();
	}

	private getPluginVariablePropertyName(pluginData: IPluginData): string {
		return `${pluginData.name}-${PluginVariablesService.PLUGIN_VARIABLES_KEY}`;
	}
}
$injector.register("pluginVariablesService", PluginVariablesService);


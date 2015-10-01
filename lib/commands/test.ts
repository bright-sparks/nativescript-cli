///<reference path="../.d.ts"/>

"use strict"

import constants = require("../constants");
import path = require('path');
import shell = require('shelljs');
import util = require('util');
import Future = require('fibers/future');
import os = require('os');

interface ITestExecutionService {
	startTestRunner(platform: string): IFuture<void>;
}

class TestExecutionService implements ITestExecutionService {
	private static RUNNER_BASE_PATH = './tns_modules/unit-test-runner/'; 
	private static MAIN_APP_NAME = TestExecutionService.RUNNER_BASE_PATH + 'app.js';
	private static CONFIG_FILE_NAME = TestExecutionService.RUNNER_BASE_PATH + 'config.js';
	private static SOCKETIO_JS_FILE_NAME = TestExecutionService.RUNNER_BASE_PATH + 'socket.io.js';

	constructor(
		private $projectData: IProjectData,
		private $platformService: IPlatformService,
		private $platformsData: IPlatformsData,
		private $usbLiveSyncServiceBase: IUsbLiveSyncServiceBase,
		private $androidUsbLiveSyncServiceLocator: {factory: Function},
		private $iosUsbLiveSyncServiceLocator: {factory: Function},
		private $devicePlatformsConstants: Mobile.IDevicePlatformsConstants,
		private $resources: IResourceLoader,
		private $httpClient: Server.IHttpClient,
		private $fs: IFileSystem,
		private $options: IOptions) {
	}

	public startTestRunner(platform: string) : IFuture<void> {
		return (() => {
			let platformData = this.$platformsData.getPlatformData(platform);

			let projectFilesPath = path.join(platformData.appDestinationDirectoryPath, constants.APP_FOLDER_NAME);
			
			this.$platformService.preparePlatform(platform).wait();
			this.detourEntryPoint(projectFilesPath).wait();

			var configJs = this.generateConfig(this.$options.port);
			this.$fs.writeFile(path.join(projectFilesPath, TestExecutionService.CONFIG_FILE_NAME), configJs).wait();
			
			var socketIoJsUrl = `http://localhost:${this.$options.port}/socket.io/socket.io.js`;
			var socketIoJs = this.$httpClient.httpRequest(socketIoJsUrl).wait().body;
			this.$fs.writeFile(path.join(projectFilesPath, TestExecutionService.SOCKETIO_JS_FILE_NAME), socketIoJs).wait();

			let watchGlob = path.join(this.$projectData.projectDir, constants.APP_FOLDER_NAME);

			let platformSpecificLiveSyncServices: IDictionary<any> = {
				android: (_device: Mobile.IDevice, $injector: IInjector): IPlatformSpecificLiveSyncService => {
					return $injector.resolve(this.$androidUsbLiveSyncServiceLocator.factory, {_device: _device});
				},
				ios: (_device: Mobile.IDevice, $injector: IInjector) => {
					return $injector.resolve(this.$iosUsbLiveSyncServiceLocator.factory, {_device: _device});
				}
			};

			let notInstalledAppOnDeviceAction = (device: Mobile.IDevice): IFuture<boolean> => {
				return (() => {
					this.$platformService.installOnDevice(platform).wait();
					this.detourEntryPoint(projectFilesPath).wait();
					return true;
				}).future<boolean>()();
			}

			let notRunningiOSSimulatorAction = (): IFuture<void> => {
				return this.$platformService.deployOnEmulator(this.$devicePlatformsConstants.iOS.toLowerCase());
			}

			let beforeBatchLiveSyncAction = (filePath: string): IFuture<string> => {
				return (() => {
					this.$platformService.preparePlatform(platform).wait();
					return path.join(projectFilesPath, path.relative(path.join(this.$projectData.projectDir, constants.APP_FOLDER_NAME), filePath));
				}).future<string>()();
			}

			let localProjectRootPath = platform.toLowerCase() === "ios" ? platformData.appDestinationDirectoryPath : null;
			this.$usbLiveSyncServiceBase.sync(platform,
				this.$projectData.projectId,
				projectFilesPath,
				constants.LIVESYNC_EXCLUDED_DIRECTORIES,
				watchGlob,
				platformSpecificLiveSyncServices,
				notInstalledAppOnDeviceAction,
				notRunningiOSSimulatorAction,
				localProjectRootPath,
				(device: Mobile.IDevice, deviceAppData:Mobile.IDeviceAppData) => Future.fromResult(),
				beforeBatchLiveSyncAction).wait();

		}).future<void>()();
	}

	allowedParameters: ICommandParameter[] = [];
	
	private detourEntryPoint(projectFilesPath: string): IFuture<void> {
		return (() => {
			var packageJsonPath = path.join(projectFilesPath, 'package.json');
			var packageJson = this.$fs.readJson(packageJsonPath).wait();
			packageJson.main = TestExecutionService.MAIN_APP_NAME;
			this.$fs.writeJson(packageJsonPath, packageJson).wait();
		}).future<void>()();
	}
	
	private generateConfig(port: Number): string {
		let nics = os.networkInterfaces();
		let ips = Object.keys(nics)
			.map(nicName => nics[nicName].filter((binding: any) => binding.family === 'IPv4' && !binding.internal)[0])
			.filter(binding => binding)
			.map(binding => binding.address);
	
		var config = {
			port: port,
			ips: ips,
		};
		
		return 'module.exports = ' + JSON.stringify(config);
	} 
}
$injector.register('testExecutionService', TestExecutionService);

function RunTestCommandFactory(platform: string) {
	return function RunTestCommand($testExecutionService: ITestExecutionService) {
		this.execute = (args: string[]): IFuture<void> => $testExecutionService.startTestRunner(platform);
		this.allowedParameters = [];
	}
}

$injector.registerCommand("dev-test|android",  RunTestCommandFactory('android'));
$injector.registerCommand("dev-test|ios",  RunTestCommandFactory('ios'));

class TestInitCommand implements ICommand {
	constructor(private $npm: INodePackageManager,
		private $projectData: IProjectData,
		private $prompter: IPrompter,
		private $fs: IFileSystem,
		private $resources: IResourceLoader,
		private $logger: ILogger) {
	}

	public execute(args: string[]) : IFuture<void> {
		return (() => {
			var frameworks = ['jasmine', 'mocha'/*, 'qunit', 'nodeunit', 'nunit'*/];
			var frameworkToInstall = this.$prompter.promptForChoice('Select testing framework:', frameworks).wait();
			var projectDir = this.$projectData.projectDir;

			['karma', 'karma-' + frameworkToInstall, 'karma-nativescript-launcher'].forEach(mod => {
				this.$npm.install(mod, projectDir, { 'save-dev': true }).wait();
			})

			var testsDir = path.join(projectDir, 'app/tests');
			if (this.$fs.exists(testsDir).wait()) {
				this.$logger.info('app/tests/ directory already exists, will not create an example test project.');
			}

			this.$fs.ensureDirectoryExists(testsDir).wait();

			var karmaConfTemplate = this.$resources.readText('test/karma.conf.js').wait();
			var karmaConf = _.template(karmaConfTemplate)({
				framework: frameworkToInstall
			});

			this.$fs.writeFile(path.join(projectDir, 'karma.conf.js'), karmaConf).wait();

			var exampleFilePath = this.$resources.resolvePath(util.format('test/example.%s.js', frameworkToInstall));

			if (this.$fs.exists(exampleFilePath).wait()) {
				this.$fs.copyFile(exampleFilePath, path.join(testsDir, 'example.js')).wait();
				this.$logger.info('Example test file created in app/tests/');
			} else {
				this.$logger.info('Place your test files under app/tests/');
			}

			this.$logger.info('Run your tests using the "$ tns test <platform>" command.');
		}).future<void>()();
	}

	allowedParameters: ICommandParameter[] = [];
}
$injector.registerCommand("test|init", TestInitCommand);

function RunKarmaTestCommandFactory(platform: string) {
	return function RunKarmaTestCommand(
		$projectData: IProjectData,
		$options: IOptions,
		$config: IConfiguration
		) {
		this.execute = (args: string[]): IFuture<void> => {
			return (() => {
				var pathToKarma = path.join($projectData.projectDir, 'node_modules/karma');
				var KarmaServer = require(path.join(pathToKarma, 'lib/server'));
				if (platform === 'ios' && $options.emulator) {
					platform = 'ios_simulator';
				}
				var karmaConfig: any = {
					browsers: [platform],
					configFile: path.join($projectData.projectDir, 'karma.conf.js'),
				};
				if ($config.DEBUG) {
					karmaConfig.logLevel = 'DEBUG';
				}
				if (!$options.watch) {
					karmaConfig.singleRun = true;
				}
				new KarmaServer(karmaConfig).start();
			}).future<void>()();
		}
		this.allowedParameters = [];
	}
}

$injector.registerCommand("test|android", RunKarmaTestCommandFactory('android'));
$injector.registerCommand("test|ios", RunKarmaTestCommandFactory('ios'));
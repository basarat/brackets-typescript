//   Copyright 2013 François de Campredon
//
//   Licensed under the Apache License, Version 2.0 (the "License");
//   you may not use this file except in compliance with the License.
//   You may obtain a copy of the License at
//
//       http://www.apache.org/licenses/LICENSE-2.0
//
//   Unless required by applicable law or agreed to in writing, software
//   distributed under the License is distributed on an "AS IS" BASIS,
//   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//   See the License for the specific language governing permissions and
//   limitations under the License.

'use strict'


import es6Promise = require('es6-promise');
import Promise = es6Promise.Promise;
import path = require('path');
import PromiseQueue = require('../commons/promiseQueue')
import signal = require('../commons/signal');
import ws = require('../commons/workingSet');
import fs = require('../commons/fileSystem');
import TypeScriptPreferenceManager = require('../commons/preferencesManager');
import TypeScriptProjectConfig = require('../commons/config');
import collections = require('../commons/collections');
import tsUtils = require('../commons/typeScriptUtils');
import utils = require('../commons/utils');
import logger = require('../commons/logger');
import TypeScriptProject = require('./project');
import Services = TypeScript.Services;

//--------------------------------------------------------------------------
//
//  TypeScriptProjectManager
//
//--------------------------------------------------------------------------


/**
 * The main facade class of the extentions, responsible to create / destroy / update projects
 * by observing config files in the files of the opened brackets folder
 */
class TypeScriptProjectManager {
    
    constructor() {
        this.queue = new PromiseQueue();
    }
    
    //-------------------------------
    //  variables
    //-------------------------------
    
    private preferenceManager: TypeScriptPreferenceManager; 
    private fileSystem: fs.FileSystem;
    private workingSet: ws.WorkingSet;
    private projectFactory: TypeScriptProjectManager.ProjectFactory;
    
    
    /**
     * a map containing the projects 
     */
    private projectMap = new collections.StringMap<TypeScriptProject>();
    
    private tempProject: TypeScriptProject;
    
    private projectRootDir: string;
    
    private queue: PromiseQueue;
    
    private defaultTypeScriptLocation: string;
    
    //-------------------------------
    // Public methods
    //------------------------------- 
    
    
    /**
     * initialize the project manager
     */
    init(defaultTypeScriptLocation: string, preferenceManager: TypeScriptPreferenceManager, fileSystem: fs.FileSystem,
        workingSet: ws.WorkingSet, projectFactory: TypeScriptProjectManager.ProjectFactory): Promise<void> {
        
        this.defaultTypeScriptLocation = defaultTypeScriptLocation;
        this.preferenceManager = preferenceManager;
        this.workingSet = workingSet;
        this.fileSystem = fileSystem;
        this.projectFactory = projectFactory;
        
        this.preferenceManager.configChanged.add(this.configChangeHandler);
        
        return this.queue.init(this.createProjects())
        
    }
    
    
    /**
     * dispose the project manager
     */
    dispose(): void {
        this.preferenceManager.configChanged.remove(this.configChangeHandler);
        this.queue.then(() => this.disposeProjects());
    }
    
    /**
     * this method will try to find a project referencing the given path
     * it will by priority try to retrive project that have that file as part of 'direct source'
     * before returning projects that just have 'reference' to this file
     * 
     * @param fileName the path of the typesrcript file for which project are looked fo
     */
    getProjectForFile(fileName: string): Promise<TypeScriptProject> {
        return this.queue.then((): any => {
            var projects = this.projectMap.values,
                project : TypeScriptProject = null;
            //first we check for a project that have tha file as source 
            projects.some(tsProject => {
                if (tsProject.getProjectFileKind(fileName) === TypeScriptProject.ProjectFileKind.SOURCE) {
                    project = tsProject;
                    return true;
                }
            })     

            
            //then we check if a project has a file referencing the given file
            if (!project) {
                projects.some(tsProject => {
                    if (tsProject.getProjectFileKind(fileName) === TypeScriptProject.ProjectFileKind.REFERENCE) {
                        project = tsProject;
                        return true;
                    }
                });     
            }

            //then we check if the current temp project has the file
            if (!project) {
                if (this.tempProject && this.tempProject.getProjectFilesSet().has(fileName)) {
                    project = this.tempProject;
                } else if (this.tempProject) {
                    this.tempProject.dispose();
                    this.tempProject = null;
                }
            }
            
            //then if still no project found we create the temp project
            if (!project) {
                var config: TypeScriptProjectConfig = utils.clone(tsUtils.typeScriptProjectConfigDefault);
                config.target = 'es5';
                config.sources = [fileName];
                this.tempProject = project = this.projectFactory(
                    '', 
                    config,  
                    this.fileSystem, 
                    this.workingSet,
                    this.defaultTypeScriptLocation
                );
                return this.tempProject.init().then(() => this.tempProject);
            }
            
            return project;
        });
    }
    
    //-------------------------------
    //  Private methods
    //------------------------------- 
    
    /**
     * find bracketsTypescript config files and create a project for each file founds
     */
    private createProjects(): Promise<any> {
        return this.preferenceManager.getProjectsConfig().then(configs => {
            return this.fileSystem.getProjectRoot().then(projectRootDir => {
                this.projectRootDir = projectRootDir;
                return Promise.all(Object.keys(configs).map(projectId => {
                    var projectConfig = configs[projectId];
                    return this.createProjectFromConfig(projectRootDir, projectConfig).then(project => {
                        this.projectMap.set(projectId, project);
                    });    
                }));
            })
        });
    }
    
    /**
     * dispose every projects created by the project Manager
     */
    private disposeProjects():void {
        var projectMap = this.projectMap;
        projectMap.keys.forEach(path =>  {
            projectMap.get(path).dispose();
        });
        this.projectMap.clear();
        if (this.tempProject) {
            this.tempProject.dispose();
            this.tempProject = null;
        }
    }
    
   
    
    /**
     * for given validated config and config file path create a project
     * 
     * @param configFilePath the config file path
     * @param config the config created from the file
     */
    private createProjectFromConfig(projectRootDir: string, config : TypeScriptProjectConfig): Promise<TypeScriptProject> {
        var project = this.projectFactory(
            projectRootDir, 
            config,  
            this.fileSystem, 
            this.workingSet,
            path.join(this.defaultTypeScriptLocation, 'lib.d.ts') 
        );
        return project.init().then(() => {
            return project;
        }, (): TypeScriptProject => {
            if (logger.warning()) {
                logger.log('could not create project:' + config.mapSource)
            }
            return null;
        })
    }

    
    //-------------------------------
    //  Events Handler
    //------------------------------- 
    
    
    /**
     * handle changes in the file system, update / delete / create project accordingly
     */
    private configChangeHandler = () => {
        this.queue.then(() => {
            this.preferenceManager.getProjectsConfig().then(configs => {
                var promises: Promise<any>[] = [];
                this.projectMap.entries.forEach(entry => {
                    var projectId = entry.key,
                        project = entry.value,
                        config = configs[projectId];
                    if (!config) {
                        project.dispose();
                        this.projectMap.delete(projectId);
                    } else {
                        promises.push(project.update(config));
                    } 
                })
                
                Object.keys(configs).forEach(projectId => {
                    if (!this.projectMap.has(projectId)) {
                        promises.push(this.createProjectFromConfig(this.projectRootDir, configs[projectId]))
                    }
                })
            });
        });
    }
}

module TypeScriptProjectManager {
    export interface ProjectFactory {
        (
            baseDirectory: string,
            config: TypeScriptProjectConfig, 
            fileSystem: fs.FileSystem,
            workingSet: ws.WorkingSet,
            typeScriptLocation: string
        ): TypeScriptProject
    }
}


export = TypeScriptProjectManager;
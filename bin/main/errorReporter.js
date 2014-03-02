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
define(["require", "exports", './utils/immediate'], function(require, exports, immediate) {
    //--------------------------------------------------------------------------
    //
    //  TypeScriptProject
    //
    //--------------------------------------------------------------------------
    /**
    * TypeScript Inspection Provider
    */
    var TypeScriptErrorReporter = (function () {
        function TypeScriptErrorReporter(errorType) {
            this.errorType = errorType;
            /**
            * name of the error reporter
            */
            this.name = 'TypeScript';
        }
        TypeScriptErrorReporter.prototype.init = function (typescriptProjectManager) {
            this.typescriptProjectManager = typescriptProjectManager;
        };

        /**
        * scan file
        */
        TypeScriptErrorReporter.prototype.scanFile = function (content, path) {
            try  {
                var project = this.typescriptProjectManager.getProjectForFile(path), languageService = project && project.getLanguageService();

                if (!project || !languageService) {
                    return { errors: [], aborted: true };
                }

                var syntacticDiagnostics = languageService.getSyntacticDiagnostics(path), errors = this.diagnosticToError(syntacticDiagnostics);

                if (errors.length === 0) {
                    var semanticDiagnostic = languageService.getSemanticDiagnostics(path);
                    errors = this.diagnosticToError(semanticDiagnostic);
                }

                return {
                    errors: errors,
                    aborted: false
                };
            } catch (e) {
                return { errors: [], aborted: true };
            }
        };

        /**
        * convert TypeScript Diagnostic or brackets error format
        * @param diagnostics
        */
        TypeScriptErrorReporter.prototype.diagnosticToError = function (diagnostics) {
            var _this = this;
            if (!diagnostics) {
                return [];
            }
            return diagnostics.map(function (diagnostic) {
                var info = diagnostic.info(), type;

                switch (info.category) {
                    case 1 /* Error */:
                        type = _this.errorType.ERROR;
                        break;
                    case 0 /* Warning */:
                        type = _this.errorType.WARNING;
                        break;
                    case 3 /* NoPrefix */:
                        type = _this.errorType.ERROR;
                        break;
                    case 2 /* Message */:
                        type = _this.errorType.META;
                        break;
                }

                return {
                    pos: {
                        line: diagnostic.line(),
                        ch: diagnostic.character()
                    },
                    endpos: {
                        line: diagnostic.line(),
                        ch: diagnostic.character() + diagnostic.length()
                    },
                    message: diagnostic.message(),
                    type: type
                };
            });
        };
        return TypeScriptErrorReporter;
    })();

    
    return TypeScriptErrorReporter;
});
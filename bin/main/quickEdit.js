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
define(["require", "exports"], function(require, exports) {
    var DocumentManager = brackets.getModule('document/DocumentManager'), MultiRangeInlineEditor = brackets.getModule('editor/MultiRangeInlineEditor').MultiRangeInlineEditor;

    var TypeScriptQuickEditProvider = (function () {
        function TypeScriptQuickEditProvider() {
            var _this = this;
            this.typeScriptInlineEditorProvider = function (hostEditor, pos) {
                if (hostEditor.getModeForSelection() !== 'typescript') {
                    return null;
                }

                var sel = hostEditor.getSelection(false);
                if (sel.start.line !== sel.end.line) {
                    return null;
                }

                var currentPath = hostEditor.document.file.fullPath, project = _this.projectManager.getProjectForFile(currentPath);
                if (!project) {
                    return null;
                }
                var languageService = project.getLanguageService();
                if (!languageService) {
                    return null;
                }
                var position = project.getIndexFromPos(currentPath, pos), definitions = languageService.getDefinitionAtPosition(currentPath, position);
                if (!definitions || definitions.length === 0) {
                    return null;
                }

                var inlineEditorRanges = definitions.map(function (definition) {
                    var startPos = project.indexToPosition(definition.fileName, definition.minChar), endPos = project.indexToPosition(definition.fileName, definition.limChar);
                    return {
                        path: definition.fileName,
                        name: (definition.containerName ? (definition.containerName + '.') : '') + definition.name,
                        lineStart: startPos.line,
                        lineEnd: endPos.line
                    };
                });
                inlineEditorRanges.filter(function (range) {
                    return range.path !== currentPath || range.lineStart !== pos.line;
                });
                if (inlineEditorRanges.length === 0) {
                    return null;
                }

                var deferred = $.Deferred(), promises = [], ranges = [];

                inlineEditorRanges.forEach(function (range) {
                    promises.push(DocumentManager.getDocumentForPath(range.path).then(function (doc) {
                        ranges.push({
                            document: doc,
                            name: range.name,
                            lineStart: range.lineStart,
                            lineEnd: range.lineEnd
                        });
                    }));
                });

                $.when.apply($, promises).then(function () {
                    var inlineEditor = new MultiRangeInlineEditor(ranges);
                    inlineEditor.load(hostEditor);
                    deferred.resolve(inlineEditor);
                }, function () {
                    return deferred.reject();
                });

                return deferred.promise();
            };
        }
        TypeScriptQuickEditProvider.prototype.init = function (projectManager) {
            this.projectManager = projectManager;
        };
        return TypeScriptQuickEditProvider;
    })();
    exports.TypeScriptQuickEditProvider = TypeScriptQuickEditProvider;
});
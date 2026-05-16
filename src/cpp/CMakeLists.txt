cmake_minimum_required(VERSION 3.15)
project(effekseer_for_web)

set(EFK_WEB_BACKEND "webgl" CACHE STRING "Backend to build: webgl or webgpu")
set_property(CACHE EFK_WEB_BACKEND PROPERTY STRINGS webgl webgpu)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_EXECUTABLE_SUFFIX ".js")

set(EFFEKSEER_DIR "${PROJECT_SOURCE_DIR}/../../Effekseer")
set(OUTPUT_NAME "effekseer-${EFK_WEB_BACKEND}-native")
set(EXPORT_NAME "effekseer_${EFK_WEB_BACKEND}_native")

include_directories(
  ${EFFEKSEER_DIR}/Dev/Cpp/Effekseer
  ${EFFEKSEER_DIR}/Dev/Cpp/Effekseer/Culling
  ${EFFEKSEER_DIR}/Dev/Cpp/EffekseerRendererCommon
  ${EFFEKSEER_DIR}/Dev/Cpp/EffekseerRendererGL
  ${EFFEKSEER_DIR}/Dev/Cpp/EffekseerRendererLLGI
  ${EFFEKSEER_DIR}/Dev/Cpp/EffekseerRendererWebGPU
  ${EFFEKSEER_DIR}/Dev/Cpp/EffekseerSoundAL
  ${EFFEKSEER_DIR}/Dev/Cpp/EffekseerMaterialCompiler
  ${EFFEKSEER_DIR}/Dev/Cpp/3rdParty/LLGI/src
)

add_definitions(-DNDEBUG)

file(GLOB effekseer_core
  ${EFFEKSEER_DIR}/Dev/Cpp/Effekseer/*.cpp
  ${EFFEKSEER_DIR}/Dev/Cpp/Effekseer/Effekseer/*.cpp
  ${EFFEKSEER_DIR}/Dev/Cpp/Effekseer/Effekseer/Culling/*.cpp
  ${EFFEKSEER_DIR}/Dev/Cpp/Effekseer/Effekseer/IO/*.cpp
  ${EFFEKSEER_DIR}/Dev/Cpp/Effekseer/Effekseer/Utils/*.cpp
  ${EFFEKSEER_DIR}/Dev/Cpp/Effekseer/Effekseer/Parameter/*.cpp
  ${EFFEKSEER_DIR}/Dev/Cpp/Effekseer/Effekseer/Material/*.cpp
  ${EFFEKSEER_DIR}/Dev/Cpp/Effekseer/Effekseer/SIMD/*.cpp
  ${EFFEKSEER_DIR}/Dev/Cpp/Effekseer/Effekseer/ForceField/*.cpp
  ${EFFEKSEER_DIR}/Dev/Cpp/Effekseer/Effekseer/Model/*.cpp
  ${EFFEKSEER_DIR}/Dev/Cpp/Effekseer/Effekseer/Noise/*.cpp
  ${EFFEKSEER_DIR}/Dev/Cpp/EffekseerRendererCommon/*.cpp
  ${EFFEKSEER_DIR}/Dev/Cpp/EffekseerRendererCommon/EffekseerRendererCommon/*.cpp
  ${EFFEKSEER_DIR}/Dev/Cpp/EffekseerSoundAL/EffekseerSoundAL/*.cpp
  ${PROJECT_SOURCE_DIR}/*.cpp
)

if(EFK_WEB_BACKEND STREQUAL "webgl")
  add_definitions(-DEFFEKSEER_FOR_WEB_WEBGL=1)
  add_definitions(-D__EFFEKSEER_RENDERER_GLES2__)
  add_definitions(-D__DISABLED_DEFAULT_TEXTURE_LOADER__)
  file(GLOB backend_sources
    ${EFFEKSEER_DIR}/Dev/Cpp/EffekseerRendererGL/EffekseerRendererGL/*.cpp
    ${EFFEKSEER_DIR}/Dev/Cpp/EffekseerMaterialCompiler/Common/*.cpp
    ${EFFEKSEER_DIR}/Dev/Cpp/EffekseerMaterialCompiler/OpenGL/*.cpp
    ${EFFEKSEER_DIR}/Dev/Cpp/EffekseerMaterialCompiler/GLSLGenerator/*.cpp
  )
elseif(EFK_WEB_BACKEND STREQUAL "webgpu")
  set(CMAKE_CXX_STANDARD 20)
  add_definitions(-DEFFEKSEER_FOR_WEB_WEBGPU=1)
  add_definitions(-DENABLE_WEBGPU)
  add_definitions(-D__EFFEKSEER_BUILD_WEBGPU__)
  file(GLOB llgi_sources
    ${EFFEKSEER_DIR}/Dev/Cpp/3rdParty/LLGI/src/*.cpp
    ${EFFEKSEER_DIR}/Dev/Cpp/3rdParty/LLGI/src/PC/*.cpp
    ${EFFEKSEER_DIR}/Dev/Cpp/3rdParty/LLGI/src/WebGPU/*.cpp
    ${EFFEKSEER_DIR}/Dev/Cpp/3rdParty/LLGI/src/Utils/*.cpp
  )
  file(GLOB backend_sources
    ${llgi_sources}
    ${EFFEKSEER_DIR}/Dev/Cpp/EffekseerRendererLLGI/EffekseerRendererLLGI/*.cpp
    ${EFFEKSEER_DIR}/Dev/Cpp/EffekseerRendererWebGPU/EffekseerRendererWebGPU/*.cpp
    ${EFFEKSEER_DIR}/Dev/Cpp/EffekseerMaterialCompiler/Common/*.cpp
    ${EFFEKSEER_DIR}/Dev/Cpp/EffekseerMaterialCompiler/GLSLGenerator/*.cpp
  )
  list(FILTER backend_sources EXCLUDE REGEX "EffekseerMaterialCompilerWebGPU\\.cpp$")
else()
  message(FATAL_ERROR "Unsupported EFK_WEB_BACKEND: ${EFK_WEB_BACKEND}")
endif()

add_executable(${OUTPUT_NAME} ${effekseer_core} ${backend_sources})
set_target_properties(${OUTPUT_NAME} PROPERTIES OUTPUT_NAME ${OUTPUT_NAME})
set(POST_JS ${PROJECT_SOURCE_DIR}/../js/post.js)
set(PRE_WEBGPU_JS ${PROJECT_SOURCE_DIR}/../js/pre_webgpu.js)
set(LINK_DEPENDS ${POST_JS})

target_compile_options(${OUTPUT_NAME} PRIVATE
  -O2
  -Wno-inconsistent-missing-override
)

target_link_options(${OUTPUT_NAME} PRIVATE
  -O2
  -sMODULARIZE=1
  -sNO_FILESYSTEM=1
  -sDISABLE_EXCEPTION_CATCHING=1
  -sNO_EXIT_RUNTIME=1
  -sALLOW_MEMORY_GROWTH=1
  -sEXPORT_NAME='${EXPORT_NAME}'
  -sEXPORTED_FUNCTIONS=['_malloc','_free']
  -sEXPORTED_RUNTIME_METHODS=['cwrap','UTF8ToString','UTF16ToString','stackSave','stackRestore','stackAlloc','setValue']
  --post-js=${POST_JS}
)

if(EFK_WEB_BACKEND STREQUAL "webgpu")
  list(APPEND LINK_DEPENDS ${PRE_WEBGPU_JS})
  target_link_options(${OUTPUT_NAME} PRIVATE
    --use-port=emdawnwebgpu
    -sASYNCIFY=1
    --pre-js=${PRE_WEBGPU_JS}
  )
  target_compile_options(${OUTPUT_NAME} PRIVATE --use-port=emdawnwebgpu)
endif()

set_target_properties(${OUTPUT_NAME} PROPERTIES LINK_DEPENDS "${LINK_DEPENDS}")

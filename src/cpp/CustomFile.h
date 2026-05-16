#pragma once

#include "Effekseer.h"
#include <emscripten.h>
#include <stdlib.h>

namespace EffekseerForWeb
{

class CustomFileReader : public Effekseer::FileReader
{
	uint8_t* fileData_ = nullptr;
	size_t fileSize_ = 0;
	int currentPosition_ = 0;

public:
	CustomFileReader(uint8_t* fileData, size_t fileSize)
		: fileData_(fileData)
		, fileSize_(fileSize)
	{
	}

	~CustomFileReader() override { free(fileData_); }

	size_t Read(void* buffer, size_t size) override
	{
		if (currentPosition_ + static_cast<int>(size) > static_cast<int>(fileSize_))
		{
			size = fileSize_ - currentPosition_;
		}

		memcpy(buffer, fileData_ + currentPosition_, size);
		currentPosition_ += static_cast<int>(size);
		return size;
	}

	void Seek(int position) override { currentPosition_ = position; }

	int GetPosition() const override { return currentPosition_; }

	size_t GetLength() const override { return fileSize_; }
};

class CustomFileInterface : public Effekseer::FileInterface
{
	Effekseer::FileReaderRef OpenReadInternal(const EFK_CHAR* path, bool isRequired)
	{
		const int loaded = EM_ASM_INT({ return Module._loadBinary(Module.UTF16ToString($0), $1) != null; }, path, isRequired ? 1 : 0);
		if (!loaded)
		{
			return nullptr;
		}

		uint8_t* fileData = nullptr;
		int fileSize = 0;

		EM_ASM_INT(
			{
				const buffer = Module._loadBinary(Module.UTF16ToString($0), $3);
				if (buffer == null) {
					setValue($1, 0, "i32");
					setValue($2, 0, "i32");
					return 0;
				}

				const memptr = _malloc(buffer.byteLength);
				HEAP8.set(new Uint8Array(buffer), memptr);
				setValue($1, memptr, "i32");
				setValue($2, buffer.byteLength, "i32");
				return 1;
			},
			path,
			&fileData,
			&fileSize,
			isRequired ? 1 : 0);

		if (fileData == nullptr)
		{
			return nullptr;
		}

		return Effekseer::MakeRefPtr<CustomFileReader>(fileData, fileSize);
	}

public:
	Effekseer::FileReaderRef OpenRead(const EFK_CHAR* path) override { return OpenReadInternal(path, true); }

	Effekseer::FileReaderRef TryOpenRead(const EFK_CHAR* path) override { return OpenReadInternal(path, false); }

	Effekseer::FileWriterRef OpenWrite(const EFK_CHAR*) override { return nullptr; }
};

} // namespace EffekseerForWeb

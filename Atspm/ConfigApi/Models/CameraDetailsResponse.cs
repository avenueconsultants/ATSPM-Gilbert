﻿#region license
// Copyright 2025 Utah Departement of Transportation
// for ConfigApi - Utah.Udot.Atspm.ConfigApi.Models/CameraDetailsResponse.cs
// 
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
// 
// http://www.apache.org/licenses/LICENSE-2.
// 
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
#endregion

namespace Utah.Udot.ATSPM.ConfigApi.Models
{
    public class CameraDetailsInfo
    {
        public string Index { get; set; }
        public string DeviceId { get; set; }
        public string Online { get; set; }
        public string IndexUrl { get; set; }
        public string IdUrl { get; set; }
    }

    public class CameraDetailsResponse
    {
        public List<CameraDetailsInfo> Cameras { get; set; } = new();
    }

    public class CameraSpecificDetailsInfo
    {
        public string Id { get; set; }
        public string Name { get; set; }
        public string Model { get; set; }
        public string FirmwareVersion { get; set; }
        public string SerialNumber { get; set; }
    }

    public class CameraZoneDetailsInfo
    {
        public string Id { get; set; }
        public string Name { get; set; }
        public string ModifiedTime { get; set; }
        public string Index { get; set; }
    }

    public class CameraZoneDetailsResponse
    {
        public List<CameraZoneDetailsInfo> Zones { get; set; } = new();
    }
}
